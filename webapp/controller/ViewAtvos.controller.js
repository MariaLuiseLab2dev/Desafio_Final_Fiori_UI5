sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/odata/v4/ODataListBinding"
], (Controller, ODataListBinding) => {
    "use strict";

    return Controller.extend("finalprojectui5.controller.ViewAtvos", {
        onInit: function () {
            // modelo local para contadores e filtros
            const oLocal = new sap.ui.model.json.JSONModel({
                counts: { totalRequisicoes: 0, totalRequisicoesText: "Requisições de Compra" },
                filter: { numero: "", solicitante: "", status: "", dataCriacao: "" }
            });
            this.getView().setModel(oLocal);

            // carrega contagem inicial
            this._updateCounts();
        },

        _updateCounts: function () {
        const oView = this.getView();

        return fetch("/odata/v4/request/BuyerRequests/$count")
            .then(r => r.text())
            .then(sCount => {
                const iCount = parseInt(sCount, 10) || 0;

                oView.getModel().setProperty("/counts/totalRequisicoes", iCount);
                oView.getModel().setProperty(
                    "/counts/totalRequisicoesText",
                    "Requisições de Compra (" + iCount + ")"
                );
            })
            .catch(console.error);
        },

        formatCurrency: function (v) {
            if (v == null) return "";
            return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        },

        formatDate: function (sIso) {
            if (!sIso) return "";
            const d = new Date(sIso);
            return d.toLocaleDateString("pt-BR",  { year: 'numeric', month: '2-digit', day: '2-digit' });
        },

        statusState: function (sStatus) {
            switch (sStatus) {
                case "APPROVED": return "Success";
                case "REJECTED": return "Error";
                case "WAITING": return "Warning";
                case "QUOTATION": return "None";
                default: return "None";
            }
        },
        
        onIconDetailsPress: function (oEvent) {
            const oContext = oEvent.getSource().getBindingContext("atvosRc");

            const sRequisitionId = oContext.getProperty("request"); 

            this.getOwnerComponent().getRouter().navTo("RouteDetails", {
                requisitionId: sRequisitionId
            });
        }
    });
});