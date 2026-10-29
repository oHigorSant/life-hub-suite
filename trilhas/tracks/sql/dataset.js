// Banco de exemplo da trilha de SQL: uma pequena loja online ("Loja Trilha").
// Dados 100% determinísticos — os exercícios são corrigidos comparando com a solução, então nada aqui é aleatório.

const clientes = [
  [1, 'Ana Souza', 'ana@email.com', '11 91111-1111', 'São Paulo', 'SP', '2023-01-15'],
  [2, 'Bruno Lima', 'bruno@email.com', null, 'Rio de Janeiro', 'RJ', '2023-02-20'],
  [3, 'Carla Mendes', 'carla@email.com', '31 93333-3333', 'Belo Horizonte', 'MG', '2023-03-05'],
  [4, 'Diego Alves', null, '41 94444-4444', 'Curitiba', 'PR', '2023-03-18'],
  [5, 'Elisa Rocha', 'elisa@email.com', '11 95555-5555', 'Campinas', 'SP', '2023-04-22'],
  [6, 'Felipe Costa', 'felipe@email.com', null, 'Niterói', 'RJ', '2023-05-30'],
  [7, 'Gabriela Dias', 'gabi@email.com', '51 97777-7777', 'Porto Alegre', 'RS', '2023-06-11'],
  [8, 'Hugo Martins', 'hugo@email.com', '71 98888-8888', 'Salvador', 'BA', '2023-07-02'],
  [9, 'Isabela Nunes', 'isa@email.com', '11 99999-0000', 'São Paulo', 'SP', '2023-08-19'],
  [10, 'João Pereira', null, null, 'Recife', 'PE', '2023-09-07'],
  [11, 'Karen Ribeiro', 'karen@email.com', '31 91212-1212', 'Uberlândia', 'MG', '2023-10-14'],
  [12, 'Lucas Barros', 'lucas@email.com', '41 91313-1313', 'Londrina', 'PR', '2023-11-25'],
];

const categorias = [
  [1, 'Eletrônicos'],
  [2, 'Livros'],
  [3, 'Casa'],
  [4, 'Esportes'],
  [5, 'Brinquedos'],
  [6, 'Moda'],
];

const produtos = [
  [1, 'Notebook Pro 14', 1, 5499.9, 12],
  [2, 'Fone Bluetooth', 1, 249.9, 80],
  [3, 'Smartphone X', 1, 2999.0, 35],
  [4, 'Teclado Mecânico', 1, 399.9, 40],
  [5, 'Mouse Gamer', 1, 149.9, 0],
  [6, 'Livro de SQL', 2, 89.9, 60],
  [7, 'Romance Policial', 2, 49.9, 100],
  [8, 'Guia de Culinária', 2, 69.9, 25],
  [9, 'Cafeteira Elétrica', 3, 189.9, 18],
  [10, 'Jogo de Panelas', 3, 329.0, 9],
  [11, 'Luminária de Mesa', 3, 79.9, 50],
  [12, 'Bola de Futebol', 4, 99.9, 70],
  [13, 'Tênis de Corrida', 4, 459.9, 22],
  [14, 'Corda de Pular', 4, 29.9, 0],
  [15, 'Quebra-cabeça 1000', 5, 59.9, 45],
  [16, 'Boneco Articulado', 5, 129.9, 30],
  [17, 'Camiseta Básica', 6, 39.9, 200],
  [18, 'Jaqueta Jeans', 6, 259.9, 15],
  [19, 'Mochila Urbana', 6, 169.9, 33],
  [20, 'Relógio Digital', 1, 219.9, 27],
];

const funcionarios = [
  [1, 'Marina Torres', 'Diretora', 18000, null, '2020-01-10'],
  [2, 'Renato Gomes', 'Gerente de Vendas', 9500, 1, '2020-06-01'],
  [3, 'Patrícia Lopes', 'Gerente de Tecnologia', 11000, 1, '2020-08-15'],
  [4, 'Sérgio Brito', 'Vendedor', 3800, 2, '2021-03-20'],
  [5, 'Tânia Freitas', 'Vendedora', 4100, 2, '2021-07-12'],
  [6, 'Vitor Santos', 'Desenvolvedor', 7200, 3, '2022-02-01'],
  [7, 'Wanda Pires', 'Desenvolvedora', 7600, 3, '2022-05-09'],
  [8, 'Yuri Campos', 'Estagiário', 1800, 3, '2023-09-04'],
];

// Gerador congruencial linear — mesma sequência sempre.
let seed = 20240607;
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed % n;
};

const statusList = ['entregue', 'entregue', 'entregue', 'enviado', 'pendente', 'cancelado'];
const pedidos = [];
const itens = [];
let itemId = 1;
for (let id = 1; id <= 40; id++) {
  const cliente = id <= 12 ? id : 1 + rnd(12); // todo cliente tem ao menos 1 pedido, exceto o 10 que fica sem (ver abaixo)
  const mes = 1 + ((id * 7) % 12);
  const dia = 1 + ((id * 11) % 28);
  const data = `2024-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  pedidos.push([id, cliente, data, statusList[rnd(statusList.length)]]);
  const n = 1 + rnd(3);
  const usados = new Set();
  for (let k = 0; k < n; k++) {
    let p = 1 + rnd(20);
    while (usados.has(p)) p = 1 + rnd(20);
    usados.add(p);
    itens.push([itemId++, id, p, 1 + rnd(3)]);
  }
}
// Cliente 10 (João) nunca comprou — útil para LEFT JOIN. Reatribui pedidos dele.
for (const p of pedidos) if (p[1] === 10) p[1] = 11;

const q = (v) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const ins = (tabela, linhas) => linhas.map((l) => `INSERT INTO ${tabela} VALUES (${l.map(q).join(', ')});`).join('\n');

export const DATASET = `
CREATE TABLE clientes (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT,
  telefone TEXT,
  cidade TEXT,
  estado TEXT,
  data_cadastro TEXT
);
CREATE TABLE categorias (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL
);
CREATE TABLE produtos (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  categoria_id INTEGER REFERENCES categorias(id),
  preco REAL NOT NULL,
  estoque INTEGER NOT NULL
);
CREATE TABLE pedidos (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER REFERENCES clientes(id),
  data TEXT NOT NULL,
  status TEXT NOT NULL
);
CREATE TABLE itens_pedido (
  id INTEGER PRIMARY KEY,
  pedido_id INTEGER REFERENCES pedidos(id),
  produto_id INTEGER REFERENCES produtos(id),
  quantidade INTEGER NOT NULL
);
CREATE TABLE funcionarios (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  cargo TEXT NOT NULL,
  salario REAL NOT NULL,
  gerente_id INTEGER REFERENCES funcionarios(id),
  data_admissao TEXT
);
${ins('clientes', clientes)}
${ins('categorias', categorias)}
${ins('produtos', produtos)}
${ins('pedidos', pedidos)}
${ins('itens_pedido', itens)}
${ins('funcionarios', funcionarios)}
`;
