/**
 * handler.js — Extrator de Leads via Receita Federal
 *
 * ESTRATÉGIA (gratuita até 3 req/min, sem chave obrigatória):
 *   1. IBGE Localidades API  → converte nome da cidade em código IBGE
 *   2. CNPJ.ws comercial     → busca CNPJs por CNAE + município (requer token Premium)
 *   3. CNPJ.ws público       → enriquece cada CNPJ com dados completos da Receita
 *
 * DADOS RETORNADOS (100% reais, Receita Federal):
 *   razão social, nome fantasia, CNPJ, endereço completo,
 *   telefone(s), e-mail, situação cadastral, data abertura,
 *   porte, sócios, CNAE principal
 *
 * VARIÁVEIS DE AMBIENTE (.env.local):
 *   CNPJWS_TOKEN   — token do CNPJ.ws (plano Premium, a partir de R$49/mês)
 *                    Sem token: só consulta individual de CNPJ (3 req/min)
 *                    Com token: pesquisa em massa por CNAE+cidade (300 req/min)
 */

// ─── Mapa nicho PT-BR → código(s) CNAE da Receita Federal ───────────────────
const NICHO_CNAE = {
    'restaurante':           ['5611201','5611203'],
    'lanchonete':            ['5612100'],
    'pizzaria':              ['5611201'],
    'churrascaria':          ['5611201'],
    'padaria':               ['1091101','5611204'],
    'confeitaria':           ['1091102'],
    'mercado':               ['4711301','4711302','4712100'],
    'supermercado':          ['4711301','4711302'],
    'acougue':               ['4722901'],
    'peixaria':              ['4723700'],
    'hortifruti':            ['4724500'],
    'bar':                   ['5611205','5813700'],
    'sorveteria':            ['5611204'],
    'medico':                ['8610101','8630503'],
    'clinica medica':        ['8630503','8630504'],
    'dentista':              ['8630501','8630502'],
    'ortodontia':            ['8630502'],
    'hospital':              ['8610101','8610102'],
    'farmacia':              ['4771701','4771702'],
    'drogaria':              ['4771701'],
    'laboratorio':           ['8640202'],
    'fisioterapia':          ['8650004'],
    'psicologo':             ['8650005'],
    'nutricionista':         ['8650006'],
    'veterinario':           ['7500100'],
    'pet shop':              ['4789004','7500100'],
    'otica':                 ['4774100'],
    'academia':              ['9313100'],
    'pilates':               ['9313100'],
    'mecanica':              ['4520001','4520002'],
    'oficina mecanica':      ['4520001'],
    'funilaria':             ['4520003'],
    'pintura automotiva':    ['4520004'],
    'eletrica automotiva':   ['4520005'],
    'borracharia':           ['4530703'],
    'posto de gasolina':     ['4731800'],
    'lava rapido':           ['4520006'],
    'autopecas':             ['4530701','4530702'],
    'despachante':           ['6911702'],
    'salao de beleza':       ['9602501','9602502'],
    'barbearia':             ['9602503'],
    'estetica':              ['9602501'],
    'manicure':              ['9602502'],
    'spa':                   ['9609202'],
    'tatuagem':              ['9609201'],
    'construcao civil':      ['4120400'],
    'eletrica':              ['4321500'],
    'hidraulica':            ['4322301'],
    'pintura':               ['4330404'],
    'marcenaria':            ['1622601','1622602'],
    'serralheria':           ['2512800'],
    'materiais construcao':  ['4744001','4744002','4744099'],
    'ferragens':             ['4744004'],
    'livraria':              ['4761001'],
    'papelaria':             ['4761002'],
    'informatica':           ['4751201','4751202'],
    'celular':               ['4752100','9511800'],
    'eletrodomesticos':      ['4753900'],
    'moveis':                ['4754701','4754702'],
    'roupas':                ['4781400'],
    'calcados':              ['4782201','4782202'],
    'joalheria':             ['4783101'],
    'brinquedos':            ['4789001'],
    'flores':                ['4789003'],
    'perfumaria':            ['4772500'],
    'advocacia':             ['6911701'],
    'advogado':              ['6911701'],
    'contabilidade':         ['6920601','6920602'],
    'contador':              ['6920601'],
    'imobiliaria':           ['6821801','6821802'],
    'corretor imoveis':      ['6821801'],
    'escola':                ['8520100','8513900'],
    'creche':                ['8511200'],
    'curso idiomas':         ['8593700'],
    'autoescola':            ['8599604'],
    'hotel':                 ['5510801'],
    'pousada':               ['5510802'],
    'hostel':                ['5510803'],
    'lavanderia':            ['9601701','9601702'],
    'grafica':               ['1813099'],
    'dedetizacao':           ['8129000'],
    'seguranca':             ['8011101'],
    'transporte':            ['4930201','4930202'],
    'taxi':                  ['4923001'],
    'mudanca':               ['4924800'],
    'motoboy':               ['5320201'],
    'software':              ['6201501','6201502'],
    'desenvolvimento':       ['6201501'],
    'ti':                    ['6209100'],
    'marketing digital':     ['7319003'],
    'agencia publicidade':   ['7311400'],
    'design':                ['7410202'],
};

function norm(texto) {
    return texto.toLowerCase().trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function encontrarCnaes(nicho) {
    const n = norm(nicho);
    for (const [k, v] of Object.entries(NICHO_CNAE)) {
        if (norm(k) === n) return { cnaes: v, chave: k };
    }
    for (const [k, v] of Object.entries(NICHO_CNAE)) {
        if (norm(k).includes(n) || n.includes(norm(k))) return { cnaes: v, chave: k };
    }
    return null;
}

// ─── 1. Código IBGE via IBGE Localidades (gratuito, sem chave) ───────────────
async function buscarMunicipio(cidade) {
    const url = `https://servicodados.ibge.gov.br/api/v1/localidades/municipios?nome=${encodeURIComponent(cidade)}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error('Erro na API do IBGE');
    const lista = await res.json();
    if (!lista.length) throw new Error(`Município "${cidade}" não encontrado`);
    const exato = lista.find(m => norm(m.nome) === norm(cidade));
    const m = exato || lista[0];
    return {
        codigo: String(m.id),
        nome: m.nome,
        uf: m['regiao-imediata']?.['regiao-intermediaria']?.microrregiao?.mesorregiao?.UF?.sigla || ''
    };
}

// ─── 2. Pesquisa massa: CNPJ.ws comercial (requer token Premium) ─────────────
async function pesquisarCnpjWs(cnae, codigoIBGE, pagina, token) {
    const params = new URLSearchParams({
        atividade_principal_id: cnae,
        municipio_id: codigoIBGE,
        situacao_cadastral: 'Ativa',
        limit: '20',
        page: String(pagina)
    });
    const url = `https://comercial.cnpj.ws/v2/pesquisa?${params}`;
    const headers = { 'Accept': 'application/json' };
    if (token) headers['x_api_token'] = token;

    const res = await fetch(url, { headers });
    if (res.status === 401 || res.status === 403) return { requerToken: true };
    if (!res.ok) throw new Error(`CNPJ.ws pesquisa: HTTP ${res.status}`);
    return res.json();
}

// ─── 3. Dados completos: CNPJ.ws público (sem chave, 3 req/min) ──────────────
async function buscarCnpj(cnpj, token) {
    const numero = cnpj.replace(/\D/g, '');
    const url = `https://publica.cnpj.ws/cnpj/${numero}`;
    const headers = { 'Accept': 'application/json' };
    if (token) headers['x_api_token'] = token;

    const res = await fetch(url, { headers });
    if (res.status === 429) throw Object.assign(new Error('rate_limit'), { isRateLimit: true });
    if (!res.ok) throw new Error(`CNPJ.ws detalhe: HTTP ${res.status}`);
    return res.json();
}

function aguardar(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ─── Formata JSON bruto → lead limpo ─────────────────────────────────────────
function formatarLead(d) {
    const e = d.estabelecimento || d;
    const socios = (d.socios || []).map(s => ({
        nome: s.nome || s.razao_social,
        qualificacao: s.qualificacao?.descricao || null,
    }));

    const tels = [
        e.ddd1 && e.telefone1 ? `(${e.ddd1}) ${e.telefone1}` : null,
        e.ddd2 && e.telefone2 ? `(${e.ddd2}) ${e.telefone2}` : null,
        e.ddd_fax && e.fax     ? `(${e.ddd_fax}) ${e.fax} (fax)` : null,
    ].filter(Boolean);

    const partes = [
        e.tipo_logradouro, e.logradouro,
        e.numero && e.numero !== '0' ? e.numero : null,
        e.complemento || null,
        e.bairro
    ].filter(Boolean);

    return {
        razao_social:    d.razao_social || null,
        nome_fantasia:   e.nome_fantasia || null,
        cnpj:            e.cnpj || null,
        situacao:        e.situacao_cadastral || null,
        data_abertura:   e.data_inicio_atividade || null,
        porte:           d.porte?.descricao || null,
        cnae_principal:  e.atividade_principal?.descricao || null,
        endereco:        partes.join(' ') || null,
        bairro:          e.bairro || null,
        cidade:          e.cidade?.nome || null,
        uf:              e.estado?.sigla || null,
        cep:             e.cep ? e.cep.replace(/(\d{5})(\d{3})/, '$1-$2') : null,
        telefones:       tels.length ? tels : null,
        email:           e.email ? e.email.toLowerCase() : null,
        socios,
        links: {
            cnpj_ws: `https://cnpj.ws/${e.cnpj}`,
            receita:  `https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/Cnpjreva_Solicitacao.asp`,
            google:   `https://www.google.com/search?q=${encodeURIComponent((e.nome_fantasia || d.razao_social || '') + ' ' + (e.cidade?.nome || ''))}`,
        }
    };
}

// ─── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Use POST' });
    }

    const { nicho, cidade, pagina = 1 } = req.body || {};

    if (!nicho || !cidade) {
        return res.status(400).json({ error: '"nicho" e "cidade" são obrigatórios' });
    }

    const TOKEN = process.env.CNPJWS_TOKEN || null;

    // 1. Municipio
    let municipio;
    try {
        municipio = await buscarMunicipio(cidade);
    } catch (e) {
        return res.status(404).json({ error: e.message });
    }

    // 2. CNAEs
    const mapeamento = encontrarCnaes(nicho);
    if (!mapeamento) {
        return res.status(422).json({
            error: `Nicho "${nicho}" não reconhecido.`,
            dica: 'Tente: restaurante, mecanica, farmacia, salao de beleza, advogado, dentista, academia, mercado, padaria, hotel...',
            nichos_suportados: Object.keys(NICHO_CNAE).sort()
        });
    }

    // 3. Pesquisa em massa (precisa de token Premium)
    let cnpjsParaBuscar = [];
    let totalEncontrado = 0;
    let modoSemToken = false;

    if (TOKEN) {
        for (const cnae of mapeamento.cnaes) {
            try {
                const resultado = await pesquisarCnpjWs(cnae, municipio.codigo, pagina, TOKEN);
                if (resultado.requerToken) break;
                const lista = resultado.data || resultado.estabelecimentos || [];
                totalEncontrado = resultado.paginacao?.total || lista.length;
                cnpjsParaBuscar = lista.map(e => e.cnpj || e.estabelecimento?.cnpj).filter(Boolean);
                if (cnpjsParaBuscar.length > 0) break;
            } catch (e) {
                console.warn('Erro na pesquisa:', e.message);
            }
        }
    } else {
        modoSemToken = true;
    }

    // 4. Enriquecimento individual
    const leads = [];
    const delay = TOKEN ? 200 : 21000; // sem token: respeita 3 req/min
    const limite = TOKEN ? 20 : 3;

    for (const cnpj of cnpjsParaBuscar.slice(0, limite)) {
        try {
            const dados = await buscarCnpj(cnpj, TOKEN);
            leads.push(formatarLead(dados));
            if (cnpjsParaBuscar.indexOf(cnpj) < Math.min(cnpjsParaBuscar.length, limite) - 1) {
                await aguardar(delay);
            }
        } catch (e) {
            if (e.isRateLimit) break;
            console.warn(`Erro CNPJ ${cnpj}:`, e.message);
        }
    }

    // ─── Resposta ─────────────────────────────────────────────────────────────
    return res.status(200).json({
        municipio: municipio.nome,
        uf: municipio.uf,
        codigo_ibge: municipio.codigo,
        nicho,
        cnae_mapeado: mapeamento.chave,
        cnaes: mapeamento.cnaes,
        total_encontrado: totalEncontrado || leads.length,
        pagina,
        leads,
        fonte: 'Receita Federal do Brasil via CNPJ.ws + IBGE',

        // Aviso honesto sobre o que está faltando
        ...(modoSemToken && {
            aviso: [
                'Sem CNPJWS_TOKEN: a pesquisa em massa por CNAE+cidade requer o plano Premium do CNPJ.ws.',
                'Sem o token, este endpoint só consegue enriquecer CNPJs individuais (3 req/min).',
                `Para buscar empresas de "${nicho}" em "${municipio.nome}" agora, acesse:`,
                `https://www.cnpj.ws/pesquisa?municipio_id=${municipio.codigo}&atividade_principal_id=${mapeamento.cnaes[0]}`,
            ].join(' '),
            busca_manual: `https://www.cnpj.ws/pesquisa?municipio_id=${municipio.codigo}&atividade_principal_id=${mapeamento.cnaes[0]}`,
            receita_federal: `https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/Cnpjreva_Solicitacao.asp`,
        })
    });
}
