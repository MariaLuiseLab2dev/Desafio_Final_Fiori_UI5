sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "sap/ui/core/Item",
    "finalprojectui5/controller/helpers"
], (Controller,
    Filter,
    FilterOperator,
    JSONModel,
    Fragment,
    Item,
    Helpers) => {
    "use strict";

    const STATUS_MAP = {
        WAITING: { key: "WAITING", text: "Aguardando Aprovação", css: "statusWaiting" },
        APPROVED: { key: "APPROVED", text: "Aprovado", css: "statusApproved" },
        QUOTATION: { key: "QUOTATION", text: "Em Cotação", css: "statusQuotation" },
        REJECTED: { key: "REJECTED", text: "Rejeitado", css: "statusRejected" }
    };

    return Controller.extend("finalprojectui5.controller.ViewAtvos", {

        _loadInitialData: async function () {
            try {
                await Promise.all([
                    this._updateCounts(),
                    this._loadStatusOptions(),
                    this._loadAvailableMonths(),
                    this._loadMaterialOptions()
                ]);

                const oSelect = this.byId("idStatusOptionsPortalSelect");
                if (oSelect) {
                    oSelect.insertItem(new Item({ key: "", text: "Todos" }), 0);
                }
            } catch (err) {
                console.error("Erro init:", err);
            }
        },

        onInit: function () {
            const oViewModel = new JSONModel({ showList: true, showDetails: false });
            this.getView().setModel(oViewModel, "view");

            // modelo local para contadores, filtros e opções
            const oLocal = new JSONModel({
                counts: { totalRequisicoes: 0, totalRequisicoesText: "Requisições de Compra" },
                filter: { numero: "", material: "", status: "", dataCriacao: "" },
                statusOptions: []
            });
            this.getView().setModel(oLocal, "local");

            // --- novo: carrega os mocks uma única vez ---
            const oHistoricoModel = new JSONModel();
            oHistoricoModel.loadData(sap.ui.require.toUrl("finalprojectui5/localService/mockdata/historico.json"));
            this.getView().setModel(oHistoricoModel, "oHistorico");

            const oLogModel = new JSONModel();
            oLogModel.loadData(sap.ui.require.toUrl("finalprojectui5/localService/mockdata/logTransporte.json"));
            this.getView().setModel(oLogModel, "oLog");
            // ---------------------------------------------

            const oTable = this.byId("idBuyerRequestsTable");
            if (oTable) {
                const oBindingInfo = oTable.getBindingInfo("items") || {};
                this._oItemTemplate = oBindingInfo.template;
                this._sOriginalModelName = oBindingInfo.model || undefined;
            }


            // carregar o modelo dashhboardData com dados iniciais
            const oDashboardModel = new JSONModel({
                monthOptions: [],
                filter: { period: "" },
                ordersStatus: { early: 0, earlyPercentage: 0, pending: 0, pendingPercentage: 0, onTime: 0, onTimePercentage: 0, outTime: 0, outTimePercentage: 0 },
                materialOptions: [],
                productCompare: { material1: "", material2: "", percentageProduct1: 0, percentageProduct2: 0 },
                totalPerRegion: { chartData: [] },
                statusPerBuyerGroup: { chartData: [] }
            });
            this.getView().setModel(oDashboardModel, "dashboardData");

            // chama a lógica assíncrona sem "await" no onInit (evita retorno de Promise)
            this._loadInitialData();
        },

        /**
         * Carrega opções de status do backend.
         * Tenta usar $apply=groupby para obter valores únicos; se falhar, usa fallback.
         */
        _loadStatusOptions: async function () {
            const oView = this.getView();

            const oLocalModel = oView.getModel("local") || oView.getModel();

            if (!oLocalModel) {
                console.error("_loadStatusOptions: nenhum JSONModel encontrado em view.getModel('local') nem em view.getModel()");
                return;
            }

            try {
                const res = await fetch("/odata/v4/request/BuyerRequests?$apply=groupby((status))");
                if (!res.ok) throw new Error("Erro ao buscar status: " + res.status);
                const json = await res.json();
                const aStatuses = (json.value || []).map(o => o.status).filter(Boolean);

                const STATUS_LABELS = {
                    WAITING: "Aguardando Aprovação",
                    APPROVED: "Aprovado",
                    QUOTATION: "Em Cotação",
                    REJECTED: "Rejeitado"
                };

                const aOptions = aStatuses.map(s => ({
                    key: s,
                    text: STATUS_LABELS[s] || s
                }));

                oLocalModel.setProperty("/statusOptions", aOptions);
            } catch (err) {
                console.error("_loadStatusOptions:", err);
                oLocalModel.setProperty("/statusOptions", [
                    { key: "WAITING", text: "Aguardando Aprovação" },
                    { key: "APPROVED", text: "Aprovado" },
                    { key: "QUOTATION", text: "Em Cotação" },
                    { key: "REJECTED", text: "Rejeitado" }
                ]);
            }
        },

        _updateCounts: async function () {
            const oLocalModel = this.getView().getModel("local");
            if (!oLocalModel) {
                console.error("_updateCounts: modelo 'local' não encontrado");
                return;
            }

            try {
                const res = await fetch("/odata/v4/request/BuyerRequests?$top=10");
                if (!res.ok) throw new Error("HTTP " + res.status);
                const data = await res.json();
                const iCount = (data.value || []).length;
                oLocalModel.setProperty("/counts/totalRequisicoes", iCount);
                oLocalModel.setProperty("/counts/totalRequisicoesText", `Requisições de Compra (${iCount})`);
            } catch (err) {
                console.error("_updateCounts erro:", err);
            }
        },

        onBuyerRequestsSearch: function (oEvent) {
            const sQuery = (oEvent.getParameter("query") || "").trim();
            const oTable = this.byId("idBuyerRequestsTable");
            const oBinding = oTable && oTable.getBinding("items");
            if (!oBinding) return;

            if (!sQuery) {
                oBinding.filter([]);
                return;
            }

            const aFilters = [
                new Filter("material/description", FilterOperator.Contains, sQuery),
                new Filter("classification/description", FilterOperator.Contains, sQuery),
                new Filter("group/description", FilterOperator.Contains, sQuery)
            ];

            // número da requisição (só se for numérico)
            if (/^\d+$/.test(sQuery)) {
                aFilters.push(new Filter("request", FilterOperator.EQ, Number(sQuery)));
            }

            // status (bate pelo texto exibido, ex: "aprovado")
            const sStatusKey = Object.keys(STATUS_MAP).find(k =>
                STATUS_MAP[k].text.toLowerCase().includes(sQuery.toLowerCase())
            );
            if (sStatusKey) {
                aFilters.push(new Filter("status", FilterOperator.EQ, sStatusKey));
            }

            // data (se o texto for uma data válida dd/mm/aaaa)
            const m = sQuery.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            if (m) {
                const sIso = `${m[3]}-${m[2]}-${m[1]}`;
                aFilters.push(new Filter({
                    filters: [
                        new Filter("createdAt", FilterOperator.GE, `${sIso}T00:00:00.000Z`),
                        new Filter("createdAt", FilterOperator.LT, `${sIso}T23:59:59.999Z`)
                    ],
                    and: true
                }));
            }

            oBinding.filter(new Filter({ filters: aFilters, and: false }));
        },

        onBuyerRequestsTableUpdateFinished: function (oEvent) {
            const oTable = oEvent.getSource();
            const aItems = oTable.getItems();

            aItems.forEach(oItem => {
                const aCells = oItem.getCells();
                const iStatusCellIndex = 7; // ajuste se necessário
                const oStatusControl = aCells[iStatusCellIndex];
                if (!oStatusControl) return;

                oStatusControl.removeStyleClass("statusBadge statusApproved statusRejected statusWaiting statusQuotation");

                const oContext = oItem.getBindingContext("atvosRc");
                const sStatus = oContext ? oContext.getProperty("status") : null;
                const map = STATUS_MAP[sStatus];

                if (map && map.css) {
                    oStatusControl.addStyleClass("statusBadge " + map.css);
                } else {
                    oStatusControl.addStyleClass("statusBadge");
                }
            });
        },

        // Formatadores
        formatRequestNumber: function (v) {
            if (v == null) return "";
            return String(v).replace(/[,.\s]/g, "");
        },

        formatCurrency: function (value) {
            if (value == null || value === "") return "";
            const number = Number(String(value).replace(/,/g, ""));
            if (isNaN(number)) return String(value);
            return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(number);
        },

        formatCompactCurrency: function (value) {
            if (value == null) return "R$ 0,00";
            return new Intl.NumberFormat("pt-BR", {
                style: "currency", currency: "BRL",
                notation: "compact", maximumFractionDigits: 1
            }).format(value);
        },

        formatCompactNumber: function (value) {
            if (value == null) return "0";
            return new Intl.NumberFormat("pt-BR").format(value);
        },

        formatMinutes: function (value) {
            if (value == null) return "0 min";
            return `${value} min`;
        },

        formatDate: function (sIso) {
            if (!sIso) return "";
            const s = (typeof sIso === "object" && sIso.value) ? sIso.value : sIso;
            const d = (typeof s === "number") ? new Date(s) : new Date(String(s));
            if (isNaN(d)) return "";
            return d.toLocaleDateString("pt-BR", { year: 'numeric', month: '2-digit', day: '2-digit' });
        },

        statusText: function (sStatus) {
            const STATUS_LABELS = {
                WAITING: "Aguardando Aprovação",
                APPROVED: "Aprovado",
                QUOTATION: "Em Cotação",
                REJECTED: "Rejeitado"
            };
            return STATUS_LABELS[sStatus] || sStatus || "";
        },

        _updateCountsWithFilters: async function (aFilters) {
            try {
                let sFilter = Helpers.buildODataFilterString(aFilters);

                const oLocal = this.getView().getModel("local");
                const sDateValue = oLocal && oLocal.getProperty("/filter/dataCriacao");
                const hasDate = Helpers.hasDateFilter(aFilters);
                const sDateFilter = (!hasDate && sDateValue) ? Helpers.buildDateFilterString(sDateValue) : "";

                if (sDateFilter) sFilter = sFilter ? `${sFilter} and (${sDateFilter})` : sDateFilter;

                const sCountUrl = "/odata/v4/request/BuyerRequests/$count" + (sFilter ? `?$filter=${encodeURIComponent(sFilter)}` : "");
                console.log("Count URL:", sCountUrl);
                console.log("sFilter (raw):", sFilter);

                const resCount = await fetch(sCountUrl, { method: "GET", headers: { "Accept": "text/plain" } });
                if (resCount.ok) {
                    const sText = await resCount.text();
                    const iCount = Number(sText) || 0;
                    if (oLocal) {
                        oLocal.setProperty("/counts/totalRequisicoes", iCount);
                        oLocal.setProperty("/counts/totalRequisicoesText", `Requisições de Compra (${iCount})`);
                    }
                    return;
                }
            } catch (err) {
                console.error("_updateCountsWithFilters erro:", err);
                const oLocal = this.getView().getModel("local");
                if (oLocal) {
                    oLocal.setProperty("/counts/totalRequisicoes", 0);
                    oLocal.setProperty("/counts/totalRequisicoesText", `Requisições de Compra (0)`);
                }
            }
        },

        onIniciarPortalPress: async function () {
            const oView = this.getView();
            const oLocal = oView.getModel("local");
            if (!oLocal) return;

            const oFilterState = oLocal.getProperty("/filter") || {};
            const oTable = this.byId("idBuyerRequestsTable");
            if (oTable) oTable.setBusy(true);

            try {
                if (oFilterState.numero || oFilterState.material) {
                    const res = await fetch("/odata/v4/request/BuyerRequests?$expand=material,classification,group");
                    if (!res.ok) throw new Error("Erro ao buscar BuyerRequests: " + res.status);
                    const json = await res.json();
                    const aAll = json.value || [];
                    const aFiltered = Helpers.applyClientSideIncludes(aAll, oFilterState);
                    const oModel = new JSONModel({ BuyerRequests: aFiltered });
                    oTable.setModel(oModel, "atvosRc");
                    oLocal.setProperty("/counts/totalRequisicoes", aFiltered.length);
                    oLocal.setProperty("/counts/totalRequisicoesText", `Requisições de Compra (${aFiltered.length})`);
                    return;
                }

                const aFilters = [];
                if (oFilterState.status) aFilters.push(new Filter("status", FilterOperator.EQ, oFilterState.status));
                const oDateFilter = Helpers.buildDateFilter(oFilterState.dataCriacao);
                if (oDateFilter) aFilters.push(oDateFilter);

                const oBinding = oTable.getBinding("items");
                if (oBinding) {
                    oBinding.filter(aFilters);
                } else if (this._oItemTemplate) {
                    oTable.setModel(null, this._sOriginalModelName);
                    oTable.bindItems({ path: "/BuyerRequests", model: this._sOriginalModelName, template: this._oItemTemplate });
                    const oNewBinding = oTable.getBinding("items");
                    if (oNewBinding) oNewBinding.filter(aFilters);
                }

                await this._updateCountsWithFilters(aFilters);
            } catch (err) {
                console.error("Erro ao aplicar filtros:", err);
            } finally {
                if (oTable) oTable.setBusy(false);
            }
        },

        onLimparButtonPress: function () {
            const oLocal = this.getView().getModel("local");
            if (!oLocal) return;

            oLocal.setProperty("/filter", { numero: "", material: "", status: "", dataCriacao: "" });

            const oTable = this.byId("idBuyerRequestsTable");
            if (!oTable) return;

            oTable.setModel(null, "atvosRc");

            if (this._oItemTemplate) {
                oTable.bindItems({
                    path: "/BuyerRequests",
                    model: this._sOriginalModelName,
                    template: this._oItemTemplate
                });
            }

            const oBinding = oTable.getBinding("items");
            if (oBinding) oBinding.filter([]);

            this._updateCounts();
        },

        onNumeroInputChange: function (oEvent) {
            const s = oEvent.getParameter("value") || "";
            const oLocal = this.getView().getModel("local");
            if (!oLocal) return;
            oLocal.setProperty("/filter/numero", String(s).trim());
        },

        onStatusOptionsSelectChange: function (oEvent) {
            const s = oEvent.getParameter("selectedItem") && oEvent.getParameter("selectedItem").getKey() || "";
            const oLocal = this.getView().getModel("local");
            if (!oLocal) return;
            oLocal.setProperty("/filter/status", s);
        },

        onDataCriacaoDatePickerChange: function (oEvent) {
            const v = oEvent.getParameter("value");
            const oLocal = this.getView().getModel("local");
            if (!oLocal) return;
            oLocal.setProperty("/filter/dataCriacao", v);
        },

        // ===== Navegação lista <-> detalhes (SEM NavContainer, usa visible toggle) =====
        onIconDetailsPress: async function (oEvent) {
            const oContext = oEvent.getSource().getBindingContext("atvosRc");
            const sRequisitionId = oContext && oContext.getProperty("request");
            if (!sRequisitionId) return;

            const oViewModel = this.getView().getModel("view");
            const oListContent = this.byId("idListContent");
            if (oListContent) oListContent.setBusy(true);

            try {
                const sUrl = `/odata/v4/request/BuyerRequests(${sRequisitionId})?$expand=material,classification,group`;
                const res = await fetch(sUrl);
                if (!res.ok) throw new Error("Erro ao buscar detalhes: " + res.status);
                const oData = await res.json();
                console.log("Detalhes recebidos:", oData);
                this.getView().setModel(new JSONModel(oData), "oDetails");
                oViewModel.setProperty("/showList", false);
                oViewModel.setProperty("/showDetails", true);
            } catch (err) {
                console.error("Erro ao carregar detalhes:", err);
            } finally {
                if (oListContent) oListContent.setBusy(false);
            }
        },

        onBackToListPress: function () {
            const oViewModel = this.getView().getModel("view");
            oViewModel.setProperty("/showList", true);
            oViewModel.setProperty("/showDetails", false);
        },

        _loadAvailableMonths: async function () {
            const oDashboardModel = this.getView().getModel("dashboardData");
            if (!oDashboardModel) {
                console.error("loadAvailableMonths: modelo 'dashboardData' não encontrado");
                return;
            }

            const aMonthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
            const iYear = 2025;

            const aMonthOptions = aMonthNames.map((sName, i) => {
                const iMonth = i + 1; // índice do array começa em 0, mês começa em 1
                return {
                    key: `${iYear}-${String(iMonth).padStart(2, "0")}`,
                    text: `${sName}/${iYear}`,
                    month: iMonth,
                    year: iYear
                };
            });

            oDashboardModel.setProperty("/monthOptions", aMonthOptions);
        },

        _loadOrdersStatus: async function (oSelectedMonth) {
            const oDashboardModel = this.getView().getModel("dashboardData");

            if (!oDashboardModel) {
                console.error("onIniciarDashboardPress: modelo 'dashboardData' não encontrado");
                return;
            }

            if (!oSelectedMonth) {
                console.error("Mês selecionado não encontrado nas opções:", oSelectedMonth);
                return;
            }

            try {
                const sUrl = `/odata/v4/dashboard/ordersStatus(month=${oSelectedMonth.month},year=${oSelectedMonth.year})`;
                const res = await fetch(sUrl);
                if (!res.ok) throw new Error("Erro ao buscar dados do dashboard: " + res.status);
                const oData = await res.json();
                console.log("Dados do dashboard recebidos:", oData);

                oDashboardModel.setProperty("/ordersStatus", {
                    early: oData.early || 0,
                    earlyPercentage: oData.earlyPercentage || 0,
                    pending: oData.pending || 0,
                    pendingPercentage: oData.pendingPercentage || 0,
                    onTime: oData.onTime || 0,
                    onTimePercentage: oData.onTimePercentage || 0,
                    outTime: oData.outTime || 0,
                    outTimePercentage: oData.outTimePercentage || 0
                });
            } catch (err) {
                console.error("Erro ao buscar dados do dashboard:", err);
            }
        },

        _loadDashboardKpis: async function (oSelectedMonth) {
            const oDashboardModel = this.getView().getModel("dashboardData");
            if (!oDashboardModel) {
                console.error("onIniciarDashboardPress: modelo 'dashboardData' não encontrado");
                return;
            }

            try {
                const sUrl = `/odata/v4/dashboard/kpis(month=${oSelectedMonth.month},year=${oSelectedMonth.year})`;
                const res = await fetch(sUrl);
                if (!res.ok) throw new Error("Erro ao buscar KPIs do dashboard: " + res.status);
                const oData = await res.json();
                console.log("KPIs do dashboard recebidos:", oData);
                oDashboardModel.setProperty("/kpis", {
                    totalBuys: oData.totalBuys || 0,
                    totalOrders: oData.totalOrders || 0,
                    totalProducts: oData.totalProducts || 0,
                    averageLeadTime: oData.averageLeadTime || 0
                });
            } catch (err) {
                console.error("Erro ao buscar KPIs do dashboard:", err);
            }
        },

        _loadMaterialOptions: async function () {
            const oDashboardModel = this.getView().getModel("dashboardData");
            if (!oDashboardModel) {
                console.error("_loadMaterialOptions: modelo 'dashboardData' não encontrado");
                return;
            }
            try {
                const res = await fetch("/odata/v4/request/Materials");
                const oData = await res.json();

                const aOptions = (oData.value || []).map(m => ({ key: m.ID, text: m.description }));
                oDashboardModel.setProperty("/materialOptions", aOptions);
                console.log("Opções de materiais carregadas:", aOptions);

            } catch (err) {
                console.error("Erro ao buscar opções de materiais:", err);
            }
        },

        _loadProductCompareData: async function (oSelectedMonth, material1, material2) {
            const oDashboardModel = this.getView().getModel("dashboardData");
            if (!oDashboardModel) {
                console.error("loadProductCompareData: modelo 'dashboardData' não encontrado");
                return;
            }

            try {
                const sMaterial1 = oDashboardModel.getProperty("/productCompare/material1");
                const sMaterial2 = oDashboardModel.getProperty("/productCompare/material2");
                
                if (!sMaterial1 || !sMaterial2) {
                    console.warn("loadProductCompareData: materiais não selecionados corretamente:", sMaterial1, sMaterial2);
                    return;
                }

                const sUrl = `/odata/v4/dashboard/productCompare(material1='${sMaterial1}',material2='${sMaterial2}',month=${oSelectedMonth.month},year=${oSelectedMonth.year})`;
                const res = await fetch(sUrl);
                if (!res.ok) throw new Error("Erro ao buscar dados de comparação de produtos: " + res.status);
                const oData = await res.json();
                console.log("Dados de comparação de produtos recebidos:", oData);
                oDashboardModel.setProperty("/productCompare/percentageProduct1", oData.percentage1 || 0);
                oDashboardModel.setProperty("/productCompare/percentageProduct2", oData.percentage2 || 0);

            } catch (err) {
                console.error("Erro ao buscar dados de comparação de produtos:", err);
            }
        },

        onProductCompareSelectChange: function () {
            const oDashboardModel = this.getView().getModel("dashboardData");
            if (!oDashboardModel) {
                console.error("onProductCompareSelectChange: modelo 'dashboardData' não encontrado");
                return;
            }

            const sSelectedPeriod = oDashboardModel.getProperty("/filter/period");
            const oSelectedMonth = (oDashboardModel.getProperty("/monthOptions") || []).find(o => o.key === sSelectedPeriod);
            if (!oSelectedMonth) {
                console.warn("onProductCompareSelectChange: nenhum mês selecionado ainda, ignorando.");
                return;
            }

            const sMaterial1 = oDashboardModel.getProperty("/productCompare/material1");
            const sMaterial2 = oDashboardModel.getProperty("/productCompare/material2");

            // _loadProductCompareData já protege contra material1/material2 vazios,
            // mas aqui a gente também confere o mês antes de tentar buscar.
            this._loadProductCompareData(oSelectedMonth, sMaterial1, sMaterial2);
        },

        _loadTotalPerRegion: async function (oSelectedMonth) {
            const oDashboardModel = this.getView().getModel("dashboardData");

            if (!oDashboardModel) {
                console.error("_loadTotalPerRegion: modelo 'dashboardData' não encontrado");
                return;
            }

            try {
                const sUrl = `/odata/v4/dashboard/totalPerRegion(month=${oSelectedMonth.month},year=${oSelectedMonth.year})`;
                const res = await fetch(sUrl);
                if (!res.ok) throw new Error("Erro ao buscar dados de total por região: " + res.status);
                const oData = await res.json();
                console.log("Dados de total por região recebidos:", oData);

                const aChartData = (oData.value || []).map(o => ({
                    name: o.name,
                    centroOeste: o.regions[0],
                    nordeste: o.regions[1],
                    norte: o.regions[2],
                    sudeste: o.regions[3],
                    sul: o.regions[4]
                }));
                oDashboardModel.setProperty("/totalPerRegion/chartData", aChartData);
            } catch (err) {
                console.error("Erro ao buscar dados de total por região:", err);
            }
        },

        _loadStatusPerBuyerGroup: async function (oSelectedMonth) {
            const oDashboardModel = this.getView().getModel("dashboardData");
            if (!oDashboardModel) {
                console.error("_loadStaturPerBuyerGroup: modelo 'dashboardData' não encontrado");
                return;
            }

            try {
                const sUrl = `/odata/v4/dashboard/statusPerBuyerGroup(month=${oSelectedMonth.month},year=${oSelectedMonth.year})`;
                const res = await fetch(sUrl);
                if (!res.ok) throw new Error("Erro ao buscar dados de status por tipo de comprador: " + res.status);
                const oData = await res.json();
                console.log("Dados de status por tipo de comprador recebidos:", oData);
                oDashboardModel.setProperty("/statusPerBuyerGroup/chartData", oData.value || []);
            } catch (err) {
                console.error("Erro ao buscar dados de status por tipo de comprador:", err);
            }
        },

        onIniciarDashboardPress: async function () {
            const oDashboardModel = this.getView().getModel("dashboardData");

            if (!oDashboardModel) {
                console.error("onIniciarDashboardPress: modelo 'dashboardData' não encontrado");
                return;
            }

            const sSelectedPeriod = oDashboardModel.getProperty("/filter/period");
            console.log("Período selecionado:", sSelectedPeriod);

            if (!sSelectedPeriod) {
                console.warn("Nenhum período selecionado para o dashboard.");
                return;
            }

            const oSelectedMonth = oDashboardModel.getProperty("/monthOptions").find(o => o.key === sSelectedPeriod);
            console.log("Mês selecionado:", oSelectedMonth);

            if (!oSelectedMonth) {
                console.error("Mês selecionado não encontrado nas opções:", sSelectedPeriod);
                return;
            }
            Promise.all([
                this._loadOrdersStatus(oSelectedMonth),
                this._loadDashboardKpis(oSelectedMonth),
                this._loadProductCompareData(oSelectedMonth, oDashboardModel.getProperty("/productCompare/material1"), oDashboardModel.getProperty("/productCompare/material2")),
                this._loadTotalPerRegion(oSelectedMonth),
                this._loadStatusPerBuyerGroup(oSelectedMonth)
            ]);
        }

    });
});
