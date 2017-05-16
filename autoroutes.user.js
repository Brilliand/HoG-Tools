// ==UserScript==
// @name         HoG Tools - Autoroute Manager
// @namespace    https://github.com/Brilliand/HoG-Tools
// @version      1.1
// @description  Provides automated autoroute handling with an arbitrary autoroute network and per-resource hubs
// @author       Brilliand
// @match        https://game274411.konggames.com/gamez/0027/4411/live/*
// @grant        none
// ==/UserScript==

(function() {
	'use strict';

	var hubs = {};
	try {
		hubs = JSON.parse(localStorage.getItem("HoGTools-AutorouteHubs")) || {};
	} catch(e) {
		console.error("Error in saved hubs:", e.stack);
		hubs = {};
	}
	function saveHubs() {
		localStorage.setItem("HoGTools-AutorouteHubs", JSON.stringify(hubs));
	}

	// Helper functions

	Array.prototype.addSet = function(a) {
		for(var i = 0; i < this.length; i++) {
			this[i] += a[i];
		}
		return this;
	};
	Array.prototype.sub = function(a) {
		return this.map(function(v, i) {
			return v - a[i];
		});
	};
	Array.prototype.multEach = function(n) {
		return this.map(function(v, i) {
			return v *= n;
		});
	};
	Array.prototype.sum = function() {
		return this.reduce(function(a, b) { return a + b; }, 0);
	};
	function reduceResources(res, reduceBy) {
		var sizes = res.slice().sort(function(a, b) { return a - b; });
		var sum = 0, n = 0, cap;
		while(sizes.length) {
			var v = sizes.pop();
			if(cap >= v)
				break;
			sum += v;
			n++;
			cap = Math.floor((sum - reduceBy) / n);
		}
		var ncapped = 0;
		res = res.map(function(v) { if(v <= cap) return v; ncapped++; return cap; });
		res.ncapped = ncapped;
		return res;
	}
	function reduceResourcesReverse(res, reduceBy) {
		var sizes = res.slice().sort(function(a, b) { return b - a; });
		var sum = 0, clip;
		while(sizes.length) {
			var v = sizes.pop();
			if(clip <= v)
				break;
			sum += v;
			clip = Math.ceil((reduceBy - sum) / sizes.length);
		}
		res = res.map(function(v) { if(v >= clip) return v - clip; return 0; });
		return res;
	}

	// Hook into game interface
	$("#icon_cont").append(function() {
		var update_autoroutes_button = $("<img>", {
			id: "update_autoroutes_button",
			src: "ui/empire.png",
			height: 30,
			width: 30,
		}).css({
			position: "absolute",
			top: "6px",
			left: "120px",
			cursor: "pointer",
		}).click(function(e) {
			e.stopPropagation();
			updateRoutes();
		}).attr("title", "Update Autoroutes");
		return update_autoroutes_button;
	});
	var observer = new MutationObserver(function(mutation) {
		var base_style = {
			float: "left",
			margin: "0 2px",
			width: "1em",
			height: "1em",
			"text-align": "center",
			cursor: "pointer",
		};
		var active_style = {
			"background-color": "#80c0ff",
			"border-radius": "1em",
		};
		var inactive_style = {
			"background-color": "",
			"border-radius": "",
		};
		$("#planet_list div[id^=planet_overview_info_] > div[id^=planet_res_]").prepend(function() {
			if($(this).find(".hub_button").length) return;
			var p_r = $(this).attr("name").split("_");
			var p = parseInt(p_r[0]);
			var r = parseInt(p_r[1]);
			var hub_button = $("<img>", {
				"class": "hub_button",
				"src": "ui/empire.png",
			}).css(base_style).data({
				planetid: p,
				resid: r,
			}).click(function(e) {
				e.stopPropagation();
				if(hubs[r] == p) {
					delete hubs[r];
					$(this).css(inactive_style).attr("title", "Set Hub");
				} else {
					if(typeof hubs[r] === "number") {
						$(".hub_button").filter(function() { 
							return $(this).data("resid") == r
							    && $(this).data("planetid") == hubs[r];
						}).css(inactive_style).attr("title", "Set Hub");
					}
					hubs[r] = p;
					$(this).css(active_style).attr("title", "Clear Hub");
				}
				saveHubs();
				updateRoutes();
			}).css((hubs[r] == p) ? active_style : inactive_style).attr("title", (hubs[r] == p) ? "Clear Hub" : "Set Hub");
			return hub_button;
		});
	});
	var options = {
		childList: true,
		subtree: true,
	};
	observer.observe(document.getElementById("planet_selection_interface"), options);

	// Handle autoroutes
	function updateRoutes() {
		var planetTransport = planets.map(function() { return {}; });

		fleetSchedule.civisFleet(game.id).filter(function(route) {
			return route.type == "auto";
		}).map(function(route) {
			var a = route.origin, b = route.destination;
			var fleet = fleetSchedule.fleets[route.fleet];
			var travelTime = parseInt(Math.floor(2 * planets[a].shortestPath[b].distance / (idleBon * fleet.speed())));
			var storage = fleet.maxStorage();

			var other = planetTransport[a][b];
			if(other) {
				if(other.storage / other.time > storage / travelTime) {
					fleet.type = "normal";
					return;
				} else {
					other.fleet.type = "normal";
				}
			}
			planetTransport[a][b] = planetTransport[b][a] = {
				time: travelTime,
				storage: storage,
				fleet: fleet,
			};
		});

		var planetQueue = planetTransport.reduce(function(arr, v, k) {
			if(Object.keys(v).length == 1) {
				var planetid = Object.keys(v)[0];
				var route = v[planetid];
				arr.push({
					from: k,
					to: planetid,
					route: route,
				});
			}
			return arr;
		}, Array());

		var planetProduction = planets.map(function(planet) {
			return planet.structure.filter(function(built) {
				return buildings[built.building].show(planet) && built.active;
			}).map(function(built) {
				var building = buildings[built.building];
				return building.rawProduction(planet).map(function(v) { return v * built.number; });
			}).reduce(function(total, v) {
				return total.addSet(v);
			}, Array(resNum).fill(0));
		});
		var totalRes = planetProduction.reduce(function(total, v) {
			v.map(function(v, k) { total[k] += v; });
			return total;
		}, Array(resNum).fill(0));

		for(var i = 0; i < planetQueue.length; i++) {
			var entry = planetQueue[i];
			if(!planetTransport[entry.from][entry.to]) continue;
			var prod = planetProduction[entry.from];
			var canLeave = Array(resNum).fill(0);
			var toTransport = prod.map(function(v, k) {
				if(hubs[k] == entry.from) {
					return v - totalRes[k];
				} else if(v < 0) {
					return v;
				} else {
					var toSpare = v + Math.min(planetProduction[entry.to][k], 0);
					var leaveBehind = Math.max(Math.min(toSpare, totalRes[k]), 0);
					if(hubs.hasOwnProperty(k)) {
						canLeave[k] = leaveBehind;
						return v;
					} else {
						return v - leaveBehind;
					}
				}
			});
			var travelTime = entry.route.time;
			var resOut = toTransport.map(function(v) { return v > 0 ? Math.ceil(v * travelTime) : 0; });
			var resIn = toTransport.map(function(v) { return v < 0 ? Math.ceil(-v * travelTime) : 0; });
			canLeave = canLeave.multEach(travelTime).map(Math.ceil);

			var outLeave = resOut.sum() - entry.route.storage;
			if(outLeave > 0) {
				var safeLeave = canLeave.sum();
				if(safeLeave > outLeave) {
					canLeave = reduceResourcesReverse(canLeave, safeLeave - outLeave);
				}
				resOut = resOut.sub(canLeave);
				if(safeLeave < outLeave) resOut = reduceResources(resOut, safeLeave - outLeave);
			}

			var inLeave = resIn.sum() - entry.route.storage;
			if(inLeave > 0) resIn = reduceResources(resIn, inLeave);

			var fleet = entry.route.fleet;
			fleet.autoRes[fleet.autoMap[entry.from]] = resOut;
			fleet.autoRes[fleet.autoMap[entry.to]] = resIn;

			var netTransport = resOut.sub(resIn).multEach(1 / travelTime);
			totalRes.addSet(netTransport.sub(prod));
			planetProduction[entry.from].addSet(netTransport.multEach(-1));
			planetProduction[entry.to].addSet(netTransport);

			delete planetTransport[entry.from][entry.to];
			delete planetTransport[entry.to][entry.from];

			var nextLinks = planetTransport[entry.to];
			if(Object.keys(nextLinks).length == 1) {
				var planetid = Object.keys(nextLinks)[0];
				var route = nextLinks[planetid];
				planetQueue.push({
					from: entry.to,
					to: planetid,
					route: route,
				});
			}
		}
	}
})();
