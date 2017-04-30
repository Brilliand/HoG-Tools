// ==UserScript==
// @name         HoG Tools - Battlecalc Link
// @namespace    https://github.com/Brilliand/HoG-Tools
// @version      1.0
// @description  Adds a link to the battle calculator on each player fleet near an enemy fleet
// @author       Brilliand
// @match        https://game274411.konggames.com/gamez/0027/4411/live/*
// @grant        none
// ==/UserScript==

(function() {
	'use strict';

	function serialize(obj) {
		return Object.keys(obj).map(function(k) {
			var v;
			if(typeof obj[k] === "object") {
				var section = obj[k];
				v = Object.keys(obj[k]).map(function(k) {
					return k+":"+section[k];
				}).join(",");
			} else {
				v = obj[k];
			}
			return k+"="+v;
		}).join("&");
	}

	var observer = new MutationObserver(function(mutation) {
		if(document.getElementById("battlecalc_button")) return;
		var parts = currentFleetId.split("_");
		var fleet = planets[parts[0]].fleets[parts[1]];
		var enemyFleet = Object.values(planets[parts[0]].fleets).filter(function(v) { return v.weight() && v.civis != game.id; })[0];
		if(!fleet || !enemyFleet || fleet.civis != game.id) return;

		var calcData = {
			ships: fleet.ships.reduce(function(obj, v, k) { if(v > 0) obj[k] = v; return obj; }, {}),
			bonuses: ["artofwar"].reduce(function(obj, name) {
				var research = researches[researchesName[name]];
				if(!research.requirement()) return obj;
				obj[name] = research.level;
				return obj;
			}, ["ammunition", "u-ammunition", "t-ammunition", "armor", "engine"].reduce(function(obj, name) {
				var resource = resourcesName[name];
				var v = fleet.storage[resource.id];
				if(v > 0) obj[name] = v;
				return obj;
			}, {})),
			enemySelected: -1,
			enemies: enemyFleet.ships.reduce(function(obj, v, k) { if(v > 0) obj[k] = v; return obj; }, {}),
		};
		var url = "https://brilliand.github.io/HoG-Tools/battlecalc.html#"+serialize(calcData);
		var attackButton = document.getElementById("attack_button");
		if(!attackButton) return;
		var calcButton = document.createElement(attackButton.tagName);
		calcButton.id = "battlecalc_button";
		calcButton.className = attackButton.className;
		var a = document.createElement("a");
		a.innerText = "Calculate Attack";
		a.className = attackButton.firstChild.className;
		a.href = url;
		a.target = "battlecalc";
		calcButton.appendChild(a);
		attackButton.parentNode.insertBefore(calcButton, attackButton.nextSibling);
	});
	var options = {
		childList: true,
		subtree: true,
	};
	observer.observe(document.getElementById("ship_info"), options);
})();
