sap.ui.define([
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], (Filter, FilterOperator) => {
    "use strict";

    /**
     * Verifica recursivamente se a lista de filtros (incluindo grupos aninhados de
     * filtros AND/OR) já contém alguma condição sobre o campo "createdAt", para
     * evitar aplicar o filtro de data duas vezes sobre a mesma consulta.
     */
    function hasDateFilter(aFilters) {
        if (!aFilters || aFilters.length === 0) return false;
        for (let i = 0; i < aFilters.length; i++) {
            const f = aFilters[i];
            if (!f) continue;
            if (f.sPath && f.sPath === "createdAt") return true;
            if (f.aFilters && Array.isArray(f.aFilters) && f.aFilters.length > 0) {
                if (hasDateFilter(f.aFilters)) return true;
            }
        }
        return false;
    }

    /**
     * Escapa aspas simples de uma string (dobrando cada uma) para que o valor possa
     * ser usado com segurança dentro de um literal de texto de uma query $filter OData.
     */
    function escapeODataString(s) {
        if (s == null) return "";
        return String(s).replace(/'/g, "''");
    }

    /**
     * Monta um sap.ui.model.Filter representando o intervalo de um dia inteiro
     * (00:00:00 até 23:59:59) sobre o campo "createdAt", a partir de uma data
     * no formato yyyy-MM-dd — usado para filtrar por "Data de Criação" na tabela.
     */
    function buildDateFilter(sDateValue) {
        if (!sDateValue) return null;
        return new Filter({
            filters: [
                new Filter("createdAt", FilterOperator.GE, `${sDateValue}T00:00:00.000Z`),
                new Filter("createdAt", FilterOperator.LT, `${sDateValue}T23:59:59.999Z`)
            ],
            and: true
        });
    }

    /**
     * Mesma condição de buildDateFilter, mas já retornada como texto pronto para
     * ser concatenado diretamente numa query string $filter do OData (usado quando
     * a contagem é buscada via fetch cru, em vez de um binding de Filter).
     */
    function buildDateFilterString(sDateValue) {
        if (!sDateValue) return "";
        return `createdAt ge ${sDateValue}T00:00:00.000Z and createdAt lt ${sDateValue}T23:59:59.999Z`;
    }

    /**
     * Converte recursivamente uma lista de sap.ui.model.Filter (incluindo grupos
     * aninhados) para a sintaxe de texto $filter usada nas chamadas OData v4,
     * suportando os operadores EQ, Contains, GE e LT.
     */
    function buildODataFilterString(aFilters) {
        if (!aFilters || aFilters.length === 0) return "";
        const parts = [];
        aFilters.forEach(f => {
            if (f.sPath && f.sOperator && f.oValue1 !== undefined) {
                const path = f.sPath;
                const op = f.sOperator;
                const val = f.oValue1;
                if (op === FilterOperator.EQ) {
                    if (typeof val === "string") parts.push(`${path} eq '${escapeODataString(val)}'`);
                    else parts.push(`${path} eq ${val}`);
                } else if (op === FilterOperator.Contains) {
                    parts.push(`contains(${path},'${escapeODataString(val)}')`);
                } else if (op === FilterOperator.GE) {
                    parts.push(`${path} ge ${val}`);
                } else if (op === FilterOperator.LT) {
                    parts.push(`${path} lt ${val}`);
                }
            } else if (f.aFilters) {
                const inner = buildODataFilterString(f.aFilters);
                if (inner) parts.push(`(${inner})`);
            }
        });
        return parts.join(" and ");
    }

    /**
     * Aplica, no lado do cliente, os filtros de número da requisição e de material
     * sobre um array de BuyerRequests já carregado — usado quando esses dois campos
     * exigem busca textual que não é resolvida direto via $filter simples do OData.
     */
    function applyClientSideIncludes(aData, oFilterState) {
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
    }

    return {
        hasDateFilter,
        escapeODataString,
        buildDateFilter,
        buildDateFilterString,
        buildODataFilterString,
        applyClientSideIncludes
    };
});
