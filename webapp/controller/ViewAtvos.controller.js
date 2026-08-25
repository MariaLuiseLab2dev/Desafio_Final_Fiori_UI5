sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "sap/ui/core/Item"
], (Controller,
	Filter,
	FilterOperator,
	JSONModel,
    Fragment,
    Item) => {
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
                    this._loadStatusOptions()
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

        // ===== helpers =====

        _hasDateFilter: function (aFilters) {
            if (!aFilters || aFilters.length === 0) return false;
            for (let i = 0; i < aFilters.length; i++) {
                const f = aFilters[i];
                if (!f) continue;
                if (f.sPath && f.sPath === "createdAt") return true;
                if (f.aFilters && Array.isArray(f.aFilters) && f.aFilters.length > 0) {
                    if (this._hasDateFilter(f.aFilters)) return true;
                }
            }
            return false;
        },

        _escapeODataString: function (s) {
            if (s == null) return "";
            return String(s).replace(/'/g, "''");
        },

        _buildDateFilter: function (sDateValue) {
            if (!sDateValue) return null;
            return new Filter({
                filters: [
                    new Filter("createdAt", FilterOperator.GE, `${sDateValue}T00:00:00.000Z`),
                    new Filter("createdAt", FilterOperator.LT, `${sDateValue}T23:59:59.999Z`)
                ],
                and: true
            });
        },

        _buildDateFilterString: function (sDateValue) {
            if (!sDateValue) return "";
            return `createdAt ge ${sDateValue}T00:00:00.000Z and createdAt lt ${sDateValue}T23:59:59.999Z`;
        },

        _buildODataFilterString: function (aFilters) {
            if (!aFilters || aFilters.length === 0) return "";
            const parts = [];
            aFilters.forEach(f => {
                if (f.sPath && f.sOperator && f.oValue1 !== undefined) {
                    const path = f.sPath;
                    const op = f.sOperator;
                    const val = f.oValue1;
                    if (op === FilterOperator.EQ) {
                        if (typeof val === "string") parts.push(`${path} eq '${this._escapeODataString(val)}'`);
                        else parts.push(`${path} eq ${val}`);
                    } else if (op === FilterOperator.Contains) {
                        parts.push(`contains(${path},'${this._escapeODataString(val)}')`);
                    } else if (op === FilterOperator.GE) {
                        parts.push(`${path} ge ${val}`);
                    } else if (op === FilterOperator.LT) {
                        parts.push(`${path} lt ${val}`);
                    }
                } else if (f.aFilters) {
                    const inner = this._buildODataFilterString(f.aFilters);
                    if (inner) parts.push(`(${inner})`);
                }
            });
            return parts.join(" and ");
        },

        _updateCountsWithFilters: async function (aFilters) {
            try {
                let sFilter = this._buildODataFilterString(aFilters);

                const oLocal = this.getView().getModel("local");
                const sDateValue = oLocal && oLocal.getProperty("/filter/dataCriacao");
                const hasDate = this._hasDateFilter(aFilters);
                const sDateFilter = (!hasDate && sDateValue) ? this._buildDateFilterString(sDateValue) : "";

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

        _applyClientSideIncludes: function (aData, oFilterState) {
            let aFiltered = aData;

            if (oFilterState.numero) {
                const sNum = String(oFilterState.numero).trim();
                aFiltered = aFiltered.filter(item =>
                    String(item.request).includes(sNum)
                );
            }

            if (oFilterState.material) {
                const sMat = oFilterState.material.toLowerCase();
                aFiltered = aFiltered.filter(item =>
                    item.material && item.material.description &&
                    item.material.description.toLowerCase().includes(sMat)
                );
            }

            return aFiltered;
        },

        onIniciarButtonPress: async function () {
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
                    const aFiltered = this._applyClientSideIncludes(aAll, oFilterState);
                    const oModel = new JSONModel({ BuyerRequests: aFiltered });
                    oTable.setModel(oModel, "atvosRc");
                    oLocal.setProperty("/counts/totalRequisicoes", aFiltered.length);
                    oLocal.setProperty("/counts/totalRequisicoesText", `Requisições de Compra (${aFiltered.length})`);
                    return;
                }

                const aFilters = [];
                if (oFilterState.status) aFilters.push(new Filter("status", FilterOperator.EQ, oFilterState.status));
                const oDateFilter = this._buildDateFilter(oFilterState.dataCriacao);
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
}

    });
});
