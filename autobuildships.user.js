// ==UserScript==
// @name         HoG Tools - Shipbuilding Queue
// @namespace    https://github.com/Brilliand/HoG-Tools
// @version      1.1
// @description  Automatically build queued ships when the resources become available
// @author       Brilliand
// @match        https://game274411.konggames.com/gamez/0027/4411/live/*
// @grant        none
// ==/UserScript==

window.shipsWanted = {};
window.setShipsWanted = function(p, s, n) {
	shipsWanted[p] = shipsWanted[p] || {};
	if(n == 0) {
		delete shipsWanted[p][s];
		if(Object.keys(shipsWanted[p]).length == 0) delete shipsWanted[p];
	} else {
		shipsWanted[p][s] = n;
	}
};
window.getShipsWanted = function(p, s) {
	return (shipsWanted[p] || {})[s] || 0;
};

(function() {
	'use strict';

	try {
		shipsWanted = JSON.parse(localStorage.getItem("HoGTools-ShipQueue")) || {};
	} catch(e) {
		console.error("Error in saved ship queue:", e.stack);
	}
	function saveShipsWanted() {
		localStorage.setItem("HoGTools-ShipQueue", JSON.stringify(shipsWanted));
	}

	// Hook into game interface
	var observer = new MutationObserver(function(mutation) {
		var planet = currentPlanet;
		var p = planet.id;
		$("#shipyard_list").children("li").each(function() {
			if($(this).find(".wanted_ship_indicator").length) return;
			if(!$(this).attr("name"))
				return;
			var s = parseInt($(this).attr("name"));
			var wanted = getShipsWanted(p, s);
			if(wanted > 0) {
				$(this.firstChild.firstChild).append(function() {
					return $("<span>", {
						class: "white_text wanted_ship_indicator",
					}).text(" + "+wanted);
				});
			}
			$("#sh_buildt_" + s).unbind("change").change(function() {
				var input = $(this);
				var v = parseInt(input.val());
				if(!shifted) v = Math.min(v, Math.floor(planet.maxMultipleShip(s)));
				if(v < 0 || isNaN(v)) v = 0;
				input.val(v);
			});
			$("#sh_dismantlet_" + s).unbind("change").change(function() {
				var input = $(this);
				var v = parseInt(input.val());
				if(!shifted) v = Math.min(v, currentPlanet.shipyardFleet.ships[s]);
				else v = Math.min(v, getShipsWanted(p, s));
				if(v < 0 || isNaN(v)) v = 0;
				input.val(v);
			});
		});
	});
	var options = {
		childList: true,
		subtree: true,
	};
	observer.observe(document.getElementById("shipyard_list"), options);

	var shifted = false;
	$(document).on('keyup keydown', function(e) {
		shifted = e.shiftKey;
		$("#shipyard_list").css({
			background: (shifted) ? "rgba(0, 0, 0, 0.5)" : "",
		});
		return true;
	});
	planets.map(function(planet, p) {
		var old = {};
		["buyShip", "buyMultipleShip", "sellShip", "sellMultipleShip"].map(function(v) {
			old[v] = planet[v];
		});
		planet.fulfillQueuedShip = function(s) {
			var wanted = getShipsWanted(this.id, s);
			var maximum = Math.floor(this.maxMultipleShip(s));
			var n = Math.min(wanted, maximum);
			if(n > 0) return old.buyMultipleShip.call(this, s, n) ? n : 0;
			return 0;
		};
		planet.buyShip = function(s) {
			if(shifted) {
				var oldWanted = getShipsWanted(p, s);
				setShipsWanted(p, s, oldWanted + 1);
				saveShipsWanted();
				return false;
			} else {
				return old.buyShip.call(this, s);
			}
		};
		planet.buyMultipleShip = function(s, a) {
			if(shifted) {
				var oldWanted = getShipsWanted(p, s);
				setShipsWanted(p, s, oldWanted + a);
				saveShipsWanted();
				return false;
			} else {
				return old.buyMultipleShip.call(this, s, a);
			}
		};
		planet.sellShip = function(s) {
			if(shifted) {
				var oldWanted = getShipsWanted(p, s);
				setShipsWanted(p, s, Math.max(oldWanted - 1, 0));
				saveShipsWanted();
				return oldWanted > 0;
			} else {
				return old.sellShip.call(this, s);
			}
		};
		planet.sellMultipleShip = function(s, a) {
			if(shifted) {
				var oldWanted = getShipsWanted(p, s);
				setShipsWanted(p, s, Math.max(oldWanted - a, 0));
				saveShipsWanted();
				return oldWanted > 0;
			} else {
				return old.sellMultipleShip.call(this, s, a);
			}
		};
	});

	// Handle ship construction
	function doQueuedConstruction() {
		game.planets.map(function(p) {
			var planet = planets[p];
			if(planet.structure[buildingsName.shipyard].number === 0 || typeof shipsWanted[p] === "undefined") return;
			if(!planet.shipyardFleet || (planet.shipyardFleet.pushed && !Object.values(planet.fleets).includes(planet.shipyardFleet))) {
				planet.shipyardFleet = new Fleet(game.id, "Empty Fleet");
				planet.shipyardFleet.pushed = false;
			}
			game.ships.filter(function(ship) {
				return ship.show() && ship.req <= planet.structure[buildingsName.shipyard].number;
			}).map(function(ship) {
				var s = ship.id;
				var wanted = getShipsWanted(planet.id, s);
				var newlyBuilt = planet.fulfillQueuedShip(s);
				if(newlyBuilt) console.log(planet.name, ship.name, newlyBuilt + " / " + wanted);
				setShipsWanted(planet.id, s, wanted - newlyBuilt);
			});
			if(planet.shipyardFleet.weight() && !planet.shipyardFleet.pushed) {
				planet.fleetPush(planet.shipyardFleet);
				planet.shipyardFleet.pushed = true;
			}
		});
		saveShipsWanted();
	}
	setInterval(doQueuedConstruction, 60*1000);
})();
