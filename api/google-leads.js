export default async function handler(req, res) {
    // Só aceita POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Use POST' });
    }

    const { nicho, cidade } = req.body;

    // Verifica se veio tudo
    if (!nicho || !cidade) {
        return res.status(400).json({ error: 'Nicho e cidade são obrigatórios' });
    }

    try {
        // Passo 1: Buscar coordenadas da cidade (gratuito, sem API key)
        const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cidade)}&format=json&limit=1`;
        const geoRes = await fetch(geoUrl, {
            headers: {
                'User-Agent': 'ExtratorLeads/1.0'
            }
        });
        const geoData = await geoRes.json();

        if (geoData.length === 0) {
            return res.status(400).json({ error: 'Cidade não encontrada' });
        }

        const lat = geoData[0].lat;
        const lng = geoData[0].lon;

        // Passo 2: Buscar lugares próximos pelo Overpass API (gratuito)
        const query = `
            [out:json];
            (
                node["amenity"~"${nicho}"] around:5000,${lat},${lng};
                way["amenity"~"${nicho}"] around:5000,${lat},${lng};
                relation["amenity"~"${nicho}"] around:5000,${lat},${lng};
            );
            out body;
        `;
        
        const overpassUrl = 'https://overpass-api.de/api/interpreter';
        const placesRes = await fetch(overpassUrl, {
            method: 'POST',
            body: query,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        const placesData = await placesRes.json();

        // Passo 3: Organizar os dados
        const leads = placesData.elements.slice(0, 50).map(place => ({
            name: place.tags?.name || 'Sem nome',
            address: place.tags?.['addr:street'] || place.tags?.['addr:full'] || 'Endereço não disponível',
            rating: 'Sem avaliação',
            total_ratings: 0,
            tipo: place.tags?.amenity || place.tags?.shop || nicho
        }));

        if (leads.length === 0) {
            return res.status(200).json([]);
        }

        return res.status(200).json(leads);

    } catch (erro) {
        console.error(erro);
        return res.status(500).json({ error: 'Erro interno: ' + erro.message });
    }
}
