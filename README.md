## Application Details
|               |
| ------------- |
|**Generation Date and Time**<br>Mon Jul 27 2026 14:02:49 GMT+0000 (Coordinated Universal Time)|
|**App Generator**<br>SAP Fiori Application Generator|
|**App Generator Version**<br>1.29.0|
|**Generation Platform**<br>SAP Business Application Studio|
|**Template Used**<br>Basic|
|**Service Type**<br>None|
|**Service URL**<br>N/A|
|**Module Name**<br>final_project_ui5|
|**Application Title**<br>Portal de Consulta de Saldo|
|**Namespace**<br>|
|**UI5 Theme**<br>sap_horizon|
|**UI5 Version**<br>1.150.0|
|**Enable TypeScript**<br>False|
|**Add Eslint configuration**<br>True, see https://www.npmjs.com/package/@sap-ux/eslint-plugin-fiori-tools#rules for the eslint rules.|

## final_project_ui5

Portal de Consulta de saldos RCs e Dashboard

### Pre-requisites

1. Active NodeJS LTS (Long Term Support) version and associated supported NPM version. (See https://nodejs.org)

---

# Documentação do Projeto

Aplicação SAPUI5 (Fiori Freestyle) para consulta de Requisições de Compra (RCs) e acompanhamento de indicadores de compras via um dashboard, consumindo dois serviços OData v4 hospedados na SAP BTP (Cloud Foundry).

- **Frontend**: SAPUI5 1.150.0, Fiori Freestyle (sem TypeScript), gerado via SAP Fiori Tools.
- **Backend**: dois serviços OData v4 já publicados na nuvem (não fazem parte deste repositório), consumidos via proxy do `ui5-tooling`.
- **Repositório**: [MariaLuiseLab2dev/Desafio_Final_Fiori_UI5](https://github.com/MariaLuiseLab2dev/Desafio_Final_Fiori_UI5)

---

## 1. Como rodar

```bash
npm install
npm start          # usa ui5.yaml — proxy contra o backend real na nuvem
npm run start-mock # usa ui5-mock.yaml — mockserver local a partir do metadata.xml
```

O app abre em `test/flp.html#app-preview` (sandbox FLP local).

---

## 2. Backend (OData v4)

Dois serviços, declarados em `webapp/manifest.json` (`sap.app.dataSources`) e proxied em `ui5.yaml` contra:
`https://4a7aeb17trial-dev-atvos-saldo-rc-srv.cfapps.us10-003.hana.ondemand.com`

### 2.1. `mainService` (namespace `RequestService`) — `/odata/v4/request/`

Serviço convencional, com EntitySets reais (todos **somente leitura** — Insert/Update/Delete desabilitados via anotações `Capabilities`).

| EntitySet | Chave | Propriedades | Navegação |
|---|---|---|---|
| `BuyerRequests` | `request` (Int64) | `quantity` (Int32), `value` (Decimal), `createdAt` (DateTimeOffset), `status` (String: `WAITING`\|`APPROVED`\|`QUOTATION`\|`REJECTED`) | `material` → Materials, `group` → BuyerGroups, `classification` → AccountClassifications |
| `Materials` | `ID` (Guid) | `description`, `suggestedValue` | — |
| `AccountClassifications` | `id` (Int32) | `description` | — |
| `BuyerGroups` | `id` (Int32) | `description` | — |

Usado pela aba **Portal de Consulta** (modelo `atvosRc`) e também pelo Dashboard para popular a lista de materiais do comparativo.

### 2.2. `dashboard` (namespace `DashboardService`) — `/odata/v4/dashboard/`

Serviço **sem EntitySets** — só *function imports* (5 funções), todas com parâmetros `month`/`year` (Int32). O metadata marca esses parâmetros como `Core.OptionalParameter`, mas **na prática o backend exige os dois** — sem eles retorna `400 "Month and Year are required"`.

| Função | Retorno | Observações |
|---|---|---|
| `kpis(month,year)` | `{ totalBuys, totalOrders, totalProducts, averageLeadTime }` | Alimenta os 4 cards de KPI |
| `ordersStatus(month,year)` | `{ early, earlyPercentage, pending, pendingPercentage, onTime, onTimePercentage, outTime, outTimePercentage }` | Alimenta os 4 gauges de "Andamento dos Pedidos". **Achado em teste real**: o backend retorna uma divisão percentual fixa (20/30/40/10) mesmo quando as contagens (`early`, `pending`...) são `0` num mês sem dado — não confiar só na porcentagem pra saber se há dado real |
| `productCompare(month,year,material1,material2)` | `{ percentage1, percentage2 }` | **Confirmado em teste real**: `material1`/`material2` esperam o **GUID** de `Materials.ID`, não a descrição em texto |
| `totalPerRegion(month,year)` | `Collection({ name, regions: [5 números] })` | `name` é o comprador **individual** (pessoa), não um grupo. A ordem dos 5 números no array **não é documentada** — o código assume ordem alfabética (Centro-Oeste, Nordeste, Norte, Sudeste, Sul); vale confirmar com quem construiu o backend |
| `statusPerBuyerGroup(month,year)` | `Collection({ name, value })` | `name` são nomes de **grupo comprador** (Engenharia, Escritório, Indústria, Logística, TI) — **não** é "tipo de despesa"/Classificação Contábil (que seria Consumo/Imobilizado/Projeto/Serviços). Não existe função pronta pra isso no backend; usamos esta como substituto e renomeamos o painel pra "Valor por Grupo Comprador" |

**Dados de teste confirmados**: outubro/2025 tem dados completos em todas as 5 funções. Muitos meses de 2026 (ano corrente) não têm dado.

---

## 3. Frontend

### 3.1. Estrutura

```
webapp/
├── Component.js
├── manifest.json                    # datasources, modelos, libs (sap.m, sap.viz, sap.suite.ui.microchart)
├── controller/
│   ├── ViewAtvos.controller.js      # controller único, cobre as 2 abas
│   └── helpers.js                   # funções puras de montagem de filtro OData
├── view/
│   ├── App.view.xml                 # shell/rootView
│   ├── ViewAtvos.view.xml           # IconTabBar com 2 abas, cada uma referenciando um fragment
│   └── fragments/
│       ├── Portal.fragment.xml      # aba "Portal de Consulta" (lista + painel de detalhes)
│       ├── Details.fragment.xml     # painel de detalhes de uma RC (histórico + log de transporte)
│       └── Dashboard.fragment.xml   # aba "Dashboard" (Controle de Compras)
├── localService/
│   ├── mainService/metadata.xml
│   ├── dashboard/metadata.xml
│   └── mockdata/
│       ├── historico.json           # mock do painel "Histórico" (detalhes da RC)
│       └── logTransporte.json       # mock do painel "Log de Transporte" (detalhes da RC)
├── css/style.css
└── i18n/i18n.properties
```

`ViewAtvos.view.xml` só declara o `IconTabBar` com as duas `IconTabFilter`; todo o conteúdo real vive nos fragments — mantém a view principal enxuta e segue o mesmo padrão do `Details.fragment.xml` que já existia.

### 3.2. Aba "Portal de Consulta" (`Portal.fragment.xml`)

- Tabela de `BuyerRequests` (`sap.m.Table`, `growing`), com filtros (Número, Material, Status, Data de Criação) e busca unificada (`SearchField` no `headerToolbar`, filtra por material/classificação/grupo/status/data/número num único campo).
- Linha da tabela com `ColumnListItem type="Navigation"` — clique abre o painel de detalhes (`idListContent`/`idDetailsContent`, alternados via binding no modelo `view`, sem `NavContainer`).
- Painel de detalhes (`Details.fragment.xml`): dados da RC (via OData real) + **Histórico** e **Log de Transporte** (dados mockados localmente, carregados uma vez no `onInit` via `JSONModel.loadData`, já que o backend não expõe isso).

### 3.3. Aba "Dashboard" — "Controle de Compras" (`Dashboard.fragment.xml`)

- **Filtros**: um único `Select` combinando mês+ano (12 opções fixas de 2025, ex. `"Outubro/2025"`, chave `"2025-10"`), guardando `month`/`year` como inteiros por trás; botão "Iniciar" dispara as 5 chamadas em paralelo (`Promise.all`).
- **4 KPI cards**: ícone + rótulo (azul escuro, negrito) + valor grande (laranja), formatados via `formatCompactCurrency`/`formatCompactNumber`/`formatMinutes`.
- **Andamento dos Pedidos**: 4 `sap.suite.ui.microchart.RadialMicroChart` (gauge circular), label + porcentagem acima, contagem real sobreposta no centro do anel (o label percentual nativo do controle é escondido via CSS e substituído por um `Text` absolutamente posicionado).
- **Comparativo 2 Produtos**: 2 `Select` (populados a partir de `mainService/Materials`, usando o GUID como chave) lado a lado + 2 `RadialMicroChart` mostrando a porcentagem de cada produto; muda automaticamente ao trocar qualquer um dos dois selects (sem precisar clicar "Iniciar" de novo).
- **Total Pedido x Comprador x Região**: `sap.viz.ui5.controls.VizFrame` (`vizType="column"`), 5 séries (uma por região) com legenda automática.
- **Valor por Grupo Comprador**: `VizFrame` (`vizType="bar"`).

### 3.4. Bibliotecas de gráfico

Duas bibliotecas foram adicionadas em `manifest.json` (`sap.ui5.dependencies.libs`), nenhuma existia antes:

- **`sap.viz`** (VizFrame) — para os 2 gráficos "de dados" (colunas com legenda, barras) que exigem múltiplas séries/categorias.
- **`sap.suite.ui.microchart`** — para os gauges de percentual único (`RadialMicroChart`), que é o controle certo pro padrão "anel colorido + número no centro" (VizFrame não faz isso nativamente).

### 3.5. Modelos usados na view (`ViewAtvos.controller.js` → `onInit`)

| Nome do modelo | Conteúdo |
|---|---|
| `view` | `{ showList, showDetails }` — controla qual bloco do Portal está visível |
| `local` | contadores, filtros e opções de status da tabela do Portal |
| `oHistorico` / `oLog` | mocks locais (histórico e log de transporte da RC selecionada) |
| `dashboardData` | tudo do Dashboard: filtro de período, opções de mês e material, e os dados das 5 chamadas |
| `oDetails` | dados reais da RC selecionada (fetch direto ao `mainService`) |
| `atvosRc` | modelo OData v4 nomeado (declarado no manifest), usado pela tabela do Portal |

### 3.6. `helpers.js`

Funções puras extraídas do controller (não dependem de `this`/view), usadas na montagem de filtros OData do Portal:

- `hasDateFilter`, `escapeODataString`, `buildDateFilter`, `buildDateFilterString`, `buildODataFilterString`, `applyClientSideIncludes`.

Importado no controller via `sap.ui.define(["finalprojectui5/controller/helpers", ...])`.
