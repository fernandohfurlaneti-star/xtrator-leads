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
        // Versão simples: retornar dados de exemplo para teste
        // Isso vai confirmar que a API route está funcionando
        
        const leadsExemplo = [
            { name: `${nicho} Exemplo 1`, address: `Rua Principal, ${cidade}`, rating: '4.5', total_ratings: 120 },
            { name: `${nicho} Exemplo 2`, address: `Av Central, ${cidade}`, rating: '4.2', total_ratings: 85 },
            { name: `${nicho} Exemplo 3`, address: `Praça da Matriz, ${cidade}`, rating: '4.8', total_ratings: 200 },
            { name: `${nicho} Exemplo 4`, address: `Rua das Flores, ${cidade}`, rating: '4.0', total_ratings: 45 },
            { name: `${nicho} Exemplo 5`, address: `Av Brasil, ${cidade}`, rating: '4.3', total_ratings: 67 }
        ];
        
        return res.status(200).json(leadsExemplo);

    } catch (erro) {
        console.error(erro);
        return res.status(500).json({ error: 'Erro interno: ' + erro.message });
    }
}
