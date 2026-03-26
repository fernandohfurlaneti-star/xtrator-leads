export default async function handler(req, res) {
    // Só aceita POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Use POST' });
    }

    const { apiKey, nicho, cidade } = req.body;

    // Verifica se veio tudo
    if (!apiKey || !nicho || !cidade) {
        return res.status(400).json({ error: 'Faltam campos' });
    }

    try {
        // Passo 1: Descobrir as coordenadas da cidade
        const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(cidade)}&key=${apiKey}`;
        const geoRes = await fetch(geoUrl);
        const geoData = await geoRes.json();

        if (geoData.status !== 'OK') {
            return res.status(400).json({ error: 'Cidade não encontrada' });
        }

        const lat = geoData.results[0].geometry.location.lat;
        const lng = geoData.results[0].geometry.location.lng;

        // Passo 2: Buscar lugares próximos
        const placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=5000&keyword=${encodeURIComponent(nicho)}&key=${apiKey}`;
        const placesRes = await fetch(placesUrl);
        const placesData = await placesRes.json();

        if (placesData.status !== 'OK') {
            return res.status(500).json({ error: 'Erro ao buscar lugares' });
        }

        // Passo 3: Organizar os dados
        const leads = placesData.results.map(place => ({
            name: place.name,
            address: place.vicinity,
            rating: place.rating || 'Sem avaliação',
            total_ratings: place.user_ratings_total || 0
        }));

        return res.status(200).json(leads);

    } catch (erro) {
        console.error(erro);
        return res.status(500).json({ error: 'Erro interno' });
    }
}
