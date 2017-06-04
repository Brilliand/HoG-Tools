// ==UserScript==
// @name         HoG Tools - Building Queue
// @namespace    https://github.com/Brilliand/HoG-Tools
// @version      1.1
// @description  Automatically build queued buildings when the resources become available
// @author       Brilliand
// @match        https://game274411.konggames.com/gamez/0027/4411/live/*
// @grant        none
// ==/UserScript==

window.buildingsWanted = {};
window.setBuildingLevelWanted = function(p, b, n) {
	buildingsWanted[p] = buildingsWanted[p] || {};
	buildingsWanted[p][b] = n;
};
window.getBuildingsWanted = function(p, b) {
	var wantedTotal = (buildingsWanted[p] || {})[b] || 0;
	var haveTotal = planets[p].structure[b].number;
	return Math.max(wantedTotal - haveTotal, 0);
};

(function() {
	'use strict';

	try {
		buildingsWanted = JSON.parse(localStorage.getItem("HoGTools-BuildingQueue")) || {};
	} catch(e) {
		console.error("Error in saved building queue:", e.stack);
	}
	function saveBuildingsWanted() {
		localStorage.setItem("HoGTools-BuildingQueue", JSON.stringify(buildingsWanted));
	}

	// Hook into game interface
	var observer = new MutationObserver(function(mutation) {
		var planet = currentPlanet;
		$("#building_list").children("li").each(function() {
			if($(this).find(".wanted_building_indicator").length) return;
			if(!$(this).attr("name"))
				return;
			var b = parseInt($(this).attr("name"));
			var built = planet.structure[b];
			var wantedTotal = (buildingsWanted[planet.id] || {})[b] || 0;
			if(wantedTotal > built.number) {
				$(this.firstChild.firstChild).append(function() {
					return $("<span>", {
						class: "white_text wanted_building_indicator",
					}).text(" / "+wantedTotal);
				});
			}
		});
	});
	var options = {
		childList: true,
		subtree: true,
	};
	observer.observe(document.getElementById("building_list"), options);

	var shifted = false;
	$(document).on('keyup keydown', function(e) {
		shifted = e.shiftKey;
		$("#building_list").css({
			background: (shifted) ? "rgba(0, 0, 0, 0.5)" : "",
		});
		return true;
	});
	planets.map(function(planet, p) {
		var old = {};
		["buyStructure", "buyMultipleStructure", "sellStructure", "sellMultipleStructure"].map(function(v) {
			old[v] = planet[v];
		});
		planet.fulfillQueuedStructure = function(b) {
			var wanted = getBuildingsWanted(this.id, b);
			for(var i = 0; i < wanted; i++) {
				var success = old.buyStructure.call(this, b);
				if(!success) break;
			}
			return i;
		};
		planet.buyStructure = function(b) {
			if(shifted) {
				var oldWanted = planet.structure[b].number + getBuildingsWanted(p, b);
				setBuildingLevelWanted(p, b, oldWanted + 1);
				saveBuildingsWanted();
				return true;
			} else {
				return old.buyStructure.call(this, b);
			}
		};
		planet.buyMultipleStructure = function(b, a, c) {
			if(shifted && !c) {
				var oldWanted = planet.structure[b].number + getBuildingsWanted(p, b);
				setBuildingLevelWanted(p, b, oldWanted + a);
				saveBuildingsWanted();
				return true;
			} else {
				return old.buyMultipleStructure.call(this, b, a, c);
			}
		};
		planet.sellStructure = function(b) {
			if(shifted) {
				var oldWanted = planet.structure[b].number + getBuildingsWanted(p, b);
				setBuildingLevelWanted(p, b, oldWanted - 1);
				saveBuildingsWanted();
				return oldWanted > planet.structure[b].number;
			} else {
				return old.sellStructure.call(this, b);
			}
		};
		planet.sellMultipleStructure = function(b, a) {
			if(shifted) {
				var oldWanted = planet.structure[b].number + getBuildingsWanted(p, b);
				setBuildingLevelWanted(p, b, oldWanted - a);
				saveBuildingsWanted();
				return oldWanted > planet.structure[b].number;
			} else {
				return old.sellMultipleStructure.call(this, b, a);
			}
		};
	});

	// Handle building construction
	function doQueuedConstruction() {
		game.planets.map(function(p) {
			var planet = planets[p];
			planet.structure.filter(function(built) {
				return buildings[built.building].show(planet) && built.active;
			}).sort(function(a, b) {
				var ab = buildings[a.building], bb = buildings[b.building];
				return (bb.type == "energy") - (ab.type == "energy")
				    || (a.number) - (b.number);
			}).map(function(built) {
				var b = built.building;
				var wanted = getBuildingsWanted(planet.id, b);
				var newlyBuilt = planet.fulfillQueuedStructure(b);
				if(newlyBuilt) console.log(planet.name, buildings[b].displayName, newlyBuilt + " / " + wanted);
			});
		});
	}
	setInterval(doQueuedConstruction, 60*1000);
})();
