export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Use POST' });
    }

    const { nicho, cidade } = req.body;

    if (!nicho || !cidade) {
        return res.status(400).json({ error: 'Nicho e cidade são obrigatórios' });
    }

    // ─── Tenta Google Places (precisa de GOOGLE_PLACES_API_KEY no .env) ───
    const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY;
    if (GOOGLE_KEY) {
        try {
            const leads = await buscarGooglePlaces(nicho, cidade, GOOGLE_KEY);
            if (leads.length > 0) return res.status(200).json(leads);
        } catch (err) {
            console.error('[Google Places] erro:', err.message);
            // cai no fallback Overpass abaixo
        }
    }

    // ─── Fallback: OpenStreetMap / Overpass API ───
    try {
        const leads = await buscarOverpass(nicho, cidade);
        if (leads.length > 0) return res.status(200).json(leads);

        return res.status(200).json({
            error: `Nenhum resultado encontrado para "${nicho}" em "${cidade}". Tente um termo mais genérico como "restaurante", "farmácia" ou "mercado".`,
            results: []
        });

    } catch (err) {
        console.error('[Overpass] erro:', err.message);
        return res.status(500).json({ error: 'Erro ao buscar dados. Tente novamente.' });
    }
}

// ─────────────────────────────────────────────────────────────
// GOOGLE PLACES API  (dados mais ricos: rating real, endereço, telefone)
// ─────────────────────────────────────────────────────────────
async function buscarGooglePlaces(nicho, cidade, apiKey) {
    // 1. Geocodifica a cidade
    const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(cidade + ', Brasil')}&key=${apiKey}`;
    const geoRes = await fetch(geoUrl);
    const geoData = await geoRes.json();

    if (geoData.status !== 'OK' || !geoData.results.length) {
        throw new Error('Cidade não encontrada no Google Geocoding');
    }

    const { lat, lng } = geoData.results[0].geometry.location;

    // 2. Busca por texto — combina nicho + cidade para máxima precisão
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(nicho + ' em ' + cidade)}&location=${lat},${lng}&radius=10000&language=pt-BR&key=${apiKey}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
        throw new Error(`Google Places retornou status: ${searchData.status}`);
    }

    const places = searchData.results || [];

    return places.slice(0, 20).map(place => ({
        name: place.name,
        address: place.formatted_address || place.vicinity || cidade,
        rating: place.rating ?? null,
        total_ratings: place.user_ratings_total ?? 0,
        tipo: (place.types || ['local'])[0].replace(/_/g, ' '),
        place_id: place.place_id,
        aberto_agora: place.opening_hours?.open_now ?? null,
        foto: place.photos?.[0]
            ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${place.photos[0].photo_reference}&key=${apiKey}`
            : null,
        maps_url: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`
    }));
}

// ─────────────────────────────────────────────────────────────
// OVERPASS API  (OpenStreetMap — gratuito, sem chave de API)
// ─────────────────────────────────────────────────────────────

// Mapa de nichos comuns em português → tags OSM
const NICHO_PARA_TAG_OSM = {
    // Alimentação
    'restaurante': [['amenity', 'restaurant']],
    'lanchonete': [['amenity', 'fast_food']],
    'pizzaria': [['amenity', 'restaurant'], ['cuisine', 'pizza']],
    'padaria': [['shop', 'bakery']],
    'mercado': [['shop', 'supermarket'], ['shop', 'convenience']],
    'supermercado': [['shop', 'supermarket']],
    'farmácia': [['amenity', 'pharmacy']],
    'farmacia': [['amenity', 'pharmacy']],
    'café': [['amenity', 'cafe']],
    'cafeteria': [['amenity', 'cafe']],
    'bar': [['amenity', 'bar'], ['amenity', 'pub']],
    // Saúde
    'médico': [['amenity', 'doctors'], ['amenity', 'clinic']],
    'medico': [['amenity', 'doctors'], ['amenity', 'clinic']],
    'dentista': [['amenity', 'dentist']],
    'hospital': [['amenity', 'hospital']],
    'clínica': [['amenity', 'clinic'], ['amenity', 'doctors']],
    'clinica': [['amenity', 'clinic'], ['amenity', 'doctors']],
    'veterinário': [['amenity', 'veterinary']],
    'veterinario': [['amenity', 'veterinary']],
    'academia': [['leisure', 'fitness_centre']],
    // Automotivo
    'mecânica': [['shop', 'car_repair']],
    'mecanica': [['shop', 'car_repair']],
    'oficina': [['shop', 'car_repair']],
    'posto de gasolina': [['amenity', 'fuel']],
    'posto': [['amenity', 'fuel']],
    'borracharia': [['shop', 'tyres']],
    'lava rápido': [['amenity', 'car_wash']],
    'lava rapido': [['amenity', 'car_wash']],
    // Serviços
    'salão de beleza': [['shop', 'hairdresser'], ['shop', 'beauty']],
    'salao de beleza': [['shop', 'hairdresser'], ['shop', 'beauty']],
    'barbearia': [['shop', 'barber']],
    'banco': [['amenity', 'bank']],
    'hotel': [['tourism', 'hotel']],
    'pousada': [['tourism', 'guest_house']],
    'escola': [['amenity', 'school']],
    'creche': [['amenity', 'kindergarten']],
    'papelaria': [['shop', 'stationery']],
    'livraria': [['shop', 'books']],
    'pet shop': [['shop', 'pet']],
    'petshop': [['shop', 'pet']],
    'lavanderia': [['shop', 'laundry'], ['amenity', 'laundry']],
    // Construção / Comércio
    'ferramenta': [['shop', 'hardware']],
    'ferramentas': [['shop', 'hardware']],
    'materiais de construção': [['shop', 'doityourself'], ['shop', 'hardware']],
    'imobiliária': [['office', 'estate_agent']],
    'imobiliaria': [['office', 'estate_agent']],
    'advocacia': [['office', 'lawyer']],
    'advogado': [['office', 'lawyer']],
    'contabilidade': [['office', 'accountant']],
    'contabilidade': [['office', 'accountant']],
};

function normalizarNicho(nicho) {
    return nicho.toLowerCase().trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function construirQueryOverpass(tags, lat, lon, raio = 5000) {
    const linhas = tags.flatMap(([chave, valor]) => [
        `node["${chave}"="${valor}"](around:${raio},${lat},${lon});`,
        `way["${chave}"="${valor}"](around:${raio},${lat},${lon});`
    ]);
    return `[out:json][timeout:25];\n(\n  ${linhas.join('\n  ')}\n);\nout body 30;`;
}

async function geocodificarCidade(cidade) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cidade + ', Brasil')}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'ExtratorLeads/2.0' } });
    const data = await res.json();
    if (!data.length) throw new Error(`Cidade "${cidade}" não encontrada`);
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

async function executarOverpass(query) {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
    return res.json();
}

async function buscarOverpass(nicho, cidade) {
    const { lat, lon } = await geocodificarCidade(cidade);

    const nichoNormalizado = normalizarNicho(nicho);
    const tagsConhecidas = NICHO_PARA_TAG_OSM[nichoNormalizado];

    let elementos = [];

    // 1. Tenta com tags OSM mapeadas (se o nicho for reconhecido)
    if (tagsConhecidas) {
        const query = construirQueryOverpass(tagsConhecidas, lat, lon);
        const data = await executarOverpass(query);
        elementos = data.elements || [];
    }

    // 2. Se não achou nada (ou nicho desconhecido), busca por nome parcial
    if (elementos.length < 3) {
        const queryNome = `[out:json][timeout:25];
(
  node["name"~"${nicho}",i](around:8000,${lat},${lon});
  way["name"~"${nicho}",i](around:8000,${lat},${lon});
);
out body 30;`;
        const data2 = await executarOverpass(queryNome);
        const extras = (data2.elements || []).filter(e => e.tags?.name);
        // Mescla sem duplicatas (por id)
        const ids = new Set(elementos.map(e => e.id));
        elementos.push(...extras.filter(e => !ids.has(e.id)));
    }

    // 3. Converte para formato de lead com dados reais
    return elementos
        .filter(e => e.tags?.name)
        .slice(0, 20)
        .map(e => {
            const tags = e.tags;

            // Endereço real a partir das tags OSM
            const partes = [
                tags['addr:street'] && tags['addr:housenumber']
                    ? `${tags['addr:street']}, ${tags['addr:housenumber']}`
                    : tags['addr:street'],
                tags['addr:suburb'] || tags['addr:neighbourhood'],
                tags['addr:city'] || cidade,
            ].filter(Boolean);

            const address = partes.length > 0 ? partes.join(', ') : cidade;

            // Tipo do estabelecimento
            const tipo = tags.amenity || tags.shop || tags.tourism ||
                         tags.leisure || tags.office || tags.healthcare || 'local';

            return {
                name: tags.name,
                address,
                rating: null,           // OSM não tem rating — não inventamos
                total_ratings: null,
                tipo: tipo.replace(/_/g, ' '),
                telefone: tags.phone || tags['contact:phone'] || null,
                website: tags.website || tags['contact:website'] || null,
                horario: tags.opening_hours || null,
                osm_id: e.id,
                maps_url: `https://www.openstreetmap.org/${e.type}/${e.id}`
            };
        });
}
