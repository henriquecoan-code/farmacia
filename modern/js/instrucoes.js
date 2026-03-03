import ComponentLoader from './services/component-loader.js';
import { bootstrap } from './bootstrap.js';

const instructions = [
    {
        id: 'abertura-loja',
        title: 'Abertura da loja',
        tags: ['rotina', 'manhã'],
        updatedAt: '03/03/2026',
        summary: 'Checklist rápido para abrir a loja com segurança.',
        steps: [
            'Desarmar o alarme e verificar portas principais.',
            'Ligar computadores, PDV e impressoras.',
            'Conferir caixa inicial e registrar no livro de caixa.',
            'Higienizar balcões e organizar vitrines.',
            'Verificar temperatura da geladeira de medicamentos.',
            'Abrir WhatsApp e e-mail corporativo.'
        ]
    },
    {
        id: 'recebimento-entregas',
        title: 'Recebimento de entregas',
        tags: ['logística'],
        updatedAt: '02/03/2026',
        summary: 'Como conferir e registrar mercadorias recebidas.',
        steps: [
            'Conferir NF-e e pedido com o fornecedor.',
            'Verificar integridade das caixas e produtos termossensíveis.',
            'Separar itens com avarias e registrar ocorrência.',
            'Dar entrada no sistema e atualizar estoque físico.',
            'Organizar produtos seguindo o método PVPS.'
        ]
    },
    {
        id: 'trocas-e-devolucoes',
        title: 'Trocas e devoluções',
        tags: ['atendimento'],
        updatedAt: '01/03/2026',
        summary: 'Procedimento padrão para trocas, devoluções e reembolsos.',
        steps: [
            'Conferir nota fiscal e prazo de troca válido.',
            'Verificar condições do produto (lacres, validade, integridade).',
            'Registrar solicitação no sistema e coletar assinatura.',
            'Encaminhar produto para área de quarentena.',
            'Avisar o farmacêutico responsável quando necessário.'
        ]
    },
    {
        id: 'estoque-ciclico',
        title: 'Conferência de estoque',
        tags: ['estoque'],
        updatedAt: '28/02/2026',
        summary: 'Rotina de conferência diária e semanal de estoque.',
        steps: [
            'Separar lista de itens críticos (top 20 giro).',
            'Conferir prateleira vs. sistema e ajustar divergências.',
            'Registrar perdas e produtos próximos ao vencimento.',
            'Informar responsável sobre faltas relevantes.',
            'Atualizar quadro de reposição rápida.'
        ]
    },
    {
        id: 'fechamento-loja',
        title: 'Fechamento da loja',
        tags: ['rotina', 'noite'],
        updatedAt: '27/02/2026',
        summary: 'Etapas finais antes de encerrar o expediente.',
        steps: [
            'Fechar caixa e emitir relatório de vendas.',
            'Guardar numerário conforme instrução interna.',
            'Desligar equipamentos e conferir portas.',
            'Ativar o alarme e confirmar status no painel.',
            'Registrar pendências para a equipe da manhã.'
        ]
    }
];

const listElement = document.getElementById('instructions-list');
const contentElement = document.getElementById('instructions-content');

const formatTags = (tags = []) => tags.map(tag => `<span class="note-tag">${tag}</span>`).join('');

const createListItem = (item) => {
    const li = document.createElement('li');
    li.className = 'instructions-list__item';
    li.innerHTML = `
        <a class="note-link" href="#${item.id}" data-id="${item.id}">
            <span class="note-link__title">${item.title}</span>
            <span class="note-link__meta">${item.summary}</span>
            <span class="note-link__tags">${formatTags(item.tags)}</span>
        </a>
    `;
    return li;
};

const createNoteCard = (item) => {
    const section = document.createElement('section');
    section.className = 'note-card';
    section.id = item.id;
    section.innerHTML = `
        <div class="note-card__header">
            <div>
                <h2>${item.title}</h2>
                <p class="note-card__summary">${item.summary}</p>
            </div>
            <div class="note-card__meta">
                <span class="note-card__date">Atualizado em ${item.updatedAt}</span>
                <span class="note-card__tags">${formatTags(item.tags)}</span>
            </div>
        </div>
        <ol class="note-card__steps">
            ${item.steps.map(step => `<li>${step}</li>`).join('')}
        </ol>
        <div class="note-card__footer">
            <a class="note-link-inline" href="#${item.id}"><i class="fas fa-link" aria-hidden="true"></i> Link direto</a>
            <button class="btn btn--secondary btn--small" type="button" data-copy-link="${item.id}">Copiar link</button>
        </div>
    `;
    return section;
};

const renderInstructions = () => {
    listElement.innerHTML = '';
    contentElement.innerHTML = '';

    if (!instructions.length) {
        contentElement.innerHTML = '<div class="note-empty">Nenhuma instrução cadastrada.</div>';
        return;
    }

    instructions.forEach((item) => {
        listElement.appendChild(createListItem(item));
        contentElement.appendChild(createNoteCard(item));
    });
};

const getBaseUrl = () => {
    const origin = window.location.origin;
    if (origin === 'null') {
        return window.location.href.split('#')[0];
    }
    return `${origin}${window.location.pathname}`;
};

const setActiveItem = (id) => {
    const links = document.querySelectorAll('.note-link');
    links.forEach(link => link.classList.toggle('note-link--active', link.dataset.id === id));
};

const resolveInitialHash = () => {
    const hash = window.location.hash.replace('#', '');
    if (hash) return hash;
    return instructions[0]?.id || '';
};

const handleHashChange = () => {
    const id = resolveInitialHash();
    if (!id) return;
    setActiveItem(id);
};

const handleCopyLink = async (id) => {
    const url = `${getBaseUrl()}#${id}`;
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        return true;
    }
    window.prompt('Copie o link abaixo:', url);
    return false;
};

const initPage = async () => {
    const loader = new ComponentLoader();
    await loader.loadHeader();
    await loader.loadFooter();

    await bootstrap.init();

    renderInstructions();
    handleHashChange();

    window.addEventListener('hashchange', handleHashChange);

    document.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-copy-link]');
        if (!button) return;
        const id = button.getAttribute('data-copy-link');
        try {
            await handleCopyLink(id);
            button.textContent = 'Link copiado';
            setTimeout(() => {
                button.textContent = 'Copiar link';
            }, 2000);
        } catch {
            button.textContent = 'Falha ao copiar';
            setTimeout(() => {
                button.textContent = 'Copiar link';
            }, 2000);
        }
    });
};

initPage();
