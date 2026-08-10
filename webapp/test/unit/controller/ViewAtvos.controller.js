/*global QUnit*/

sap.ui.define([
	"finalprojectui5/controller/ViewAtvos.controller"
], function (Controller) {
	"use strict";

	QUnit.module("ViewAtvos Controller");

	QUnit.test("I should test the ViewAtvos controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
