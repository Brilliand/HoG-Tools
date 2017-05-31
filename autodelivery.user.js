// ==UserScript==
// @name         HoG Tools - Automated Deliveries
// @namespace    https://github.com/Brilliand/HoG-Tools
// @version      1.1
// @description  Uses a group of designated fleets to handle resource requests
// @author       Brilliand
// @match        https://game274411.konggames.com/gamez/0027/4411/live/*
// @grant        none
// ==/UserScript==

window.requests = {};
window.setRequest = function(planetid, resid, quantity) {
	requests[planetid] = requests[planetid] || {};
	if(quantity == 0) {
		delete requests[planetid][resid];
		if(Object.keys(requests[planetid]).length == 0) delete requests[planetid];
	} else {
		requests[planetid][resid] = quantity;
	}
};
window.getRequest = function(planetid, resid) {
	return (requests[planetid] || {})[resid] || 0;
};

// Compatibility for all possible versions (or absence) of autoroutes script
if(typeof hubs === "undefined") window.hubs = {};
if(typeof isHub === "undefined") {
	window.isHub = function(resid, planetid) {
		return hubs.hasOwnProperty(resid) && (hubs[resid][planetid] || hubs[resid] == planetid);
	};
}
if(typeof getResourceHubs === "undefined") {
	window.getResourceHubs = function(resid) {
		var results = Array();
		switch(typeof hubs[resid]) {
		case "number":
			results.push(hubs[resid]);
			break;
		case "object":
			results = Object.values(hubs[resid]);
			break;
		}
		return results.filter(function(p) {
			return game.searchPlanet(p);
		});
	};
}

(function() {
	'use strict';

	try {
		requests = JSON.parse(localStorage.getItem("HoGTools-ResourcesRequested")) || {};
	} catch(e) {
		console.error("Error in saved requests:", e.stack);
	}
	function saveResourcesRequested() {
		localStorage.setItem("HoGTools-ResourcesRequested", JSON.stringify(requests));
	}

	// Static Configuration
	var productionBufferTime = 10 * 60;

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
	Array.prototype.filterInplace = function(callback) {
		this.map(function(v, k, a) {
			if(!callback(v, k, a)) delete a[k];
		});
		return this;
	};
	Fleet.prototype.beginTransportMission = function(source, destination, resources) {
		var fleet = this;
		var planet = planets[source];
		resources && resources.map(function(n, r) {
			n = Math.min(n, planet.resources[r]);
			if(n > 0) fleet.load(r, n) && planet.resourcesAdd(r, -n);
			return fleet.storage[r];
		});
		var travelTime = fleet.move(source, destination);
		if(travelTime != -1) {
			for(var f in planet.fleets) if(planet.fleets[f] === fleet) delete planet.fleets[f];
		} else {
			console.log("Fleet movement from "+planets[source].name+" to "+planets[destination].name+" failed");
		}
		return travelTime;
	};
	Fleet.prototype.divideFleet = function(p, ships, name) {
		var oldFleet = this;
		var newFleet = new Fleet(oldFleet.civis, name || oldFleet.name);
		ships.map(function(v, k) {
			if(v > oldFleet.ships[k]) v = oldFleet.ships[k];
			oldFleet.ships[k] -= v;
			newFleet.ships[k] += v;
		});
		newFleet.type = oldFleet.type;

		// Avoid creating an empty fleet
		if(oldFleet.ships.sum() == 0) {
			oldFleet.name = newFleet.name;
			oldFleet.ships = newFleet.ships;
			return oldFleet;
		} else if(newFleet.ships.sum() == 0) {
			return null;
		}

		// Move resources to old fleet
		var storageSplit = 1 / (1 + oldFleet.maxStorage() / newFleet.maxStorage());
		oldFleet.storage.map(function(v, k) {
			if(v == 0) return;
			var amt = v * storageSplit;
			oldFleet.storage[k] -= amt;
			newFleet.storage[k] += amt;
		});

		// Place the new fleet on the planet
		var f = 0;
		while(planets[p].fleets[f]) f++;
		planets[p].fleets[f] = newFleet;

		return newFleet;
	};
	Fleet.prototype.mergeFleet = function(planet, targetFleet) {
		var oldFleet = this;
		var newFleet = new Fleet(oldFleet.civis, name || oldFleet.name);
		ships.map(function(v, k) {
			if(v > oldFleet.ships[k]) v = oldFleet.ships[k];
			oldFleet.ships[k] -= v;
			newFleet.ships[k] += v;
		});

		// Move resources to old fleet
		var storageSplit = 1 / (1 + oldFleet.maxStorage() / newFleet.maxStorage());
		oldFleet.storage.map(function(v, k) {
			if(v == 0) return;
			var amt = v * storageSplit;
			oldFleet.storage[k] -= amt;
			newFleet.storage[k] += amt;
		});

		// Place the new fleet on the planet
		var f = 0;
		while(planet.fleets[f]) f++;
		planet.fleets[f] = newFleet;

		return newFleet;
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

	// Hook into game interface
	var observer = new MutationObserver(function(mutation) {
		if(document.getElementById("deliveriesov_button")) return;

		// Add button to show delivery fleets
		var deliveriesov_button = $("#autoroutesov_button").clone().click(function() {
			exportTravelingShipInterface("auto_delivery");
		}).attr("id", "deliveriesov_button");
		deliveriesov_button.find("*").last().text("Deliveries");
		deliveriesov_button.insertAfter($("#autoroutesov_button"));

		$("#ship_info_placeholder").css("height", $("#ship_mini_list")[0].scrollHeight + 16 + "px");
	});
	var options = {
		childList: true,
		subtree: true,
	};
	observer.observe(document.getElementById("ship_mini_list"), options);

	var observer = new MutationObserver(function(mutation) {
		if("shipInterface" != currentInterface) return;
		if(document.getElementById("autodelivery_button")) return;
		if(typeof currentFleetId === "undefined") return;

		var parts = currentFleetId.split("_");
		var planet = planets[parts[0]];
		var fleet = planet.fleets[parts[1]];
		if(typeof fleet === "undefined" || fleet.civis != game.id) return;

		// Add button to set fleet as delivery fleet
		var autodelivery_button = $("#automove_button").clone().click(function() {
			fleet.type = "auto_delivery";
			$(this).replaceWith(stopdelivery_button);
		}).attr("id", "autodelivery_button");
		autodelivery_button.find("*").last().text("Automatic Delivery");
		var stopdelivery_button = $("#automove_button").clone().click(function() {
			fleet.type = "normal";
			$(this).replaceWith(autodelivery_button);
		}).attr("id", "autodelivery_button");
		stopdelivery_button.find("*").last().text("Stop Deliveries");

		(fleet.type == "auto_delivery" ? stopdelivery_button : autodelivery_button).insertAfter($("#automove_button"));
	});
	var options = {
		childList: true,
		subtree: true,
	};
	observer.observe(document.getElementById("ship_info"), options);

	// Handle stockpile movement
	function doFreightMovement() {
		var availableFreighters = Array();
		game.planets.map(function(p) {
			var planet = planets[p];
			var mergeWith = Array();
			Object.keys(planet.fleets).map(function(f) {
				var fleet = planet.fleets[f];
				if(fleet.civis == game.id && fleet.type == "auto_delivery") {
					var fleetSpeed = fleet.speed();
					for(var i = 0; i < mergeWith.length; i++) {
						if(mergeWith[i].speed == fleetSpeed) {
							mergeWith[i].fleet.fusion(fleet);
							delete planet.fleets[f];
							return;
						}
					}
					mergeWith.push({
						fleet: fleet,
						speed: fleetSpeed,
					});
					availableFreighters.push({
						planet: p,
						fleet: fleet,
					});
				}
			});
		});
		if(availableFreighters.length) {
			var planetRequests = planets.map(function(planet, p) {
				if(!game.searchPlanet(p)) return null;
				var planetRequest = Array(resNum).fill(p).map(getRequest);
				if(typeof getBuildingsWanted !== "undefined") {
					planetRequest = planet.structure.filter(function(built) {
						return buildings[built.building].show(planet) && built.active;
					}).map(function(built) {
						var n = built.number + getBuildingsWanted(planet.id, built.building);
						var resourceRequests = Array(resNum).fill(0);
						for(var i = built.number; i < n; i++) resourceRequests = resourceRequests.map(function(v, k) { return v + built.showCost(k, i); });
						return resourceRequests;
					}).reduce(function(total, v) {
						return total.addSet(v);
					}, planetRequest);
				}
				planetRequest = planetRequest.map(function(v) { return Math.max(v, 0); });
				return planetRequest;
			}).filterInplace(Boolean);
			availableFreighters.map(function(v) {
				var p = v.planet;
				var fleet = v.fleet;
				if(planetRequests[p]) {
					fleet.unload(p);
				}
			});

			var planetProduction = planets.map(function(planet) {
				return planet.structure.filter(function(built) {
					return buildings[built.building].show(planet) && built.active;
				}).map(function(built) {
					var building = buildings[built.building];
					var n = built.number;
					if(typeof getBuildingsWanted !== "undefined") n += getBuildingsWanted(planet.id, built.building);
					return building.rawProduction(planet).map(function(v) { return (v < 0) ? v * n : v * built.number; });
				}).reduce(function(total, v) {
					return total.addSet(v);
				}, Array(resNum).fill(0));
			});
			planetProduction.map(function(prod, p) {
				if(planetRequests[p]) planetRequests[p].addSet(prod.map(function(v) {
					var bufferNeeded = -v * productionBufferTime;
					return Math.max(bufferNeeded, 0);
				}));
			});

			var shortages = {};
			planetRequests.map(function(requests, p) {
				planets[p].resources.sub(requests).map(function(v, k) {
					if(v < 0) {
						shortages[k] = shortages[k] || {};
						shortages[k][p] = -v;
					}
				});
			});
			fleetSchedule.civisFleet(game.id).filter(function(route) {
				return route.type == "auto_delivery";
			}).map(function(route) {
				var p = route.destination;
				var fleet = fleetSchedule.fleets[route.fleet];
				for(var k in shortages) {
					if(shortages[k][p] && fleet.storage[k]) {
						shortages[k][p] -= fleet.storage[k];
						if(shortages[k][p] <= 0) delete shortages[k][p];
						if(Object.keys(shortages[k]).length == 0) delete shortages[k];
					}
				}
			});
			planetProduction.map(function(prod, p) {
				if(planetRequests[p]) prod.map(function(v, r) {
					var bufferNeeded = -v * productionBufferTime;
					if(bufferNeeded > 0 && shortages[r] && shortages[r][p]) shortages[r][p] += bufferNeeded;
				});
			});

			var now = (new Date()).getTime();
			fleetSchedule.civisFleet(game.id).filter(function(route) {
				return route.type == "auto";
			}).map(function(route) {
				var a = route.origin, b = route.destination;
				var fleet = fleetSchedule.fleets[route.fleet];
				var travelTime = parseInt(Math.floor(2 * planets[a].shortestPath[b].distance / (idleBon * fleet.speed())));
				var ar = fleet.autoRes[fleet.autoMap[a]], br = fleet.autoRes[fleet.autoMap[b]];

				var timeRemaining = Math.max((route.totalTime - now) / idleBon, (planets[a].shortestPath[b].hops - route.hop) / fpsFleet);
				var timeTotal = Math.max(travelTime / 2, planets[a].shortestPath[b].hops / fpsFleet);
				var routeTraveled = Math.max(1 - timeRemaining / timeTotal, 0) / 2;
				planetRequests[a].addSet(br.sub(br.sub(ar).multEach(routeTraveled)));
				planetRequests[b].addSet(ar.sub(ar.sub(br).multEach(routeTraveled + 0.5)));
			});

			console.log("Preparing transports for:", resources.map(function(resource, r) {
				var abundance = planetRequests.map(function(requests, p) {
					var excess = planets[p].resources[r] - requests[r];
					if(excess > 0) return excess;
					else return 0;
				}).sum();
				var shortage = Object.values(shortages[r] || {}).sum();
				if(shortage == 0) return false;
				return (abundance > shortage) ? beauty(shortage) : beauty(abundance) + "/" + beauty(shortage);
			}).reduce(function(obj, v, k) {
				if(v) obj[resources[k].name.capitalize()] = v;
				return obj;
			}, {}));
			availableFreighters = availableFreighters.filter(function(v) {
				var p = v.planet;
				var planet = planets[p];
				var paths = planets[p].shortestPath;
				var fleet = v.fleet;
				var minStorage = fleet.ships.map(function(v, k) { if(v) return ships[k].maxStorage; }).filter(Boolean).min();

				// Add some variety to fleet destination choices
				var travelCosts = paths.map(function(v) { return v.distance * (1 + Math.random()); });

				if(planetRequests[p]) {
					var excesses = planet.resources.sub(planetRequests[p]).filterInplace(function(v, k) {
						return v > Math.max(0, planetProduction[p][k] * productionBufferTime);
					});
					var shortageMissions = excesses.map(function(v, k) {
						if(!shortages[k]) return false;
						var locations = Object.keys(shortages[k]);
						return {
							resource: k,
							amount: v,
							planets: locations,
						};
					}).filter(Boolean);
					var hubMissions = excesses.map(function(v, k) {
						if(isHub(k, p)) return false;
						var locations = getResourceHubs(k);
						return {
							resource: k,
							amount: v,
							planets: locations,
						};
					}).filter(Boolean);
					var missionPlanets = game.planets.reduce(function(obj, p) {
						if(isFinite(travelCosts[p])) obj[p] = {
							planet: p,
							distance: travelCosts[p],
							resources: Array(),
						};
						return obj;
					}, {});
					shortageMissions.map(function(v) {
						var resource = v.resource;

						v.planets.filter(function(p) {
							return missionPlanets[p];
						}).map(function(p) {
							missionPlanets[p].resources.push({
								resource: resource,
								value: 2,
								priority: Math.random(),
							});
						});
					});
					hubMissions.map(function(v) {
						var resource = v.resource;

						v.planets.filter(function(p) {
							return missionPlanets[p];
						}).map(function(p) {
							missionPlanets[p].resources.push({
								resource: resource,
								value: 1,
								priority: Math.random(),
							});
						});
					});
					var missions = Object.values(missionPlanets).filter(function(v) {
						return v.resources.length;
					}).map(function(v) {
						v.resources.sort(function(a, b) { return a.value - b.value || a.priority - b.priority; });
						v.value = v.resources[0].value;
						v.amount = v.resources.map(function(v) {
							return v.amount;
						}).sum();
						return v;
					}).sort(function(a, b) {
						var as = Math.min(minStorage, a.amount), bs = Math.min(minStorage, b.amount);
						return a.value - b.value || b.distance * as - a.distance * bs;
					});
					while(missions.length) {
						var mission = missions.pop();

						var storageMax = fleet.maxStorage();
						var storageRes = 0;
						var transport = mission.resources.reduce(function(transport, v) {
							var r = v.resource;
							var maxAmount;
							if(isHub(v.resource, mission.planet)) maxAmount = Infinity;
							else maxAmount = (shortages[r] && shortages[r][mission.planet]) || 0;
							maxAmount = Math.min(Math.ceil(maxAmount), Math.floor(planet.resources[r] - planetRequests[p][r]));
							if(maxAmount == 0 || storageRes >= storageMax) {
								return transport;
							} else if(storageRes + maxAmount <= storageMax) {
								transport[r] = maxAmount;
								storageRes += maxAmount;
							} else {
								transport[r] = storageMax - storageRes;
								storageRes = storageMax;
							}
							return transport;
						}, Array());

						var storageReserved = 0;
						var transportShips = fleet.ships.map(function(n, s) {
							var ship = ships[s];
							if(n == 0 || ship.maxStorage == 0) return 0;
							if(ship.maxStorage * n > storageRes - storageReserved) n = Math.ceil((storageRes - storageReserved) / ship.maxStorage);
							storageReserved += ship.maxStorage * n;
							return n;
						});
						if(storageReserved == 0) continue;

						if(storageReserved < storageRes) {
							transport = reduceResources(transport, storageRes - storageReserved);
						}

						transport.map(function(v, r) {
							if(shortages[r] && shortages[r][mission.planet]) {
								shortages[r][mission.planet] -= v;
								if(shortages[r][mission.planet] <= 0) delete shortages[r][mission.planet];
								if(Object.keys(shortages[r]).length == 0) delete shortages[r];
							}
						});

						var transportFleet = fleet.divideFleet(p, transportShips, fleet.name);
						transportFleet.beginTransportMission(p, mission.planet, transport);
						if(fleet === transportFleet) return false;
					}
				}

				return true;
			});

			var pickupSources = game.planets.map(function(k) {
				var obj = {
					planet: k,
					value: 0,
					amount: 0,
				};
				if(!planetRequests[k]) return obj;

				var excesses = planets[k].resources.sub(planetRequests[k]);
				var amounts = {};
				for(var i in shortages) {
					var shortageAmount = Object.entries(shortages[i]).reduce(function(total, v) {
						if(planets[k].shortestPath[v[0]]) total += v[1];
						return total;
					}, 0);
					if(excesses[i] > 0 && shortageAmount > 0) {
						obj.value = 2;
						amounts[i] = Math.min(excesses[i], shortageAmount);
					}
				}
				for(var i in hubs) {
					var hubReachable = getResourceHubs(i).filter(function(v) {
						return planets[k].shortestPath[v] && k != v;
					}).length;
					if(excesses[i] > 0 && hubReachable) {
						if(obj.value < 1) obj.value = 1;
						amounts[i] = excesses[i];
					}
				}
				obj.amount = Object.values(amounts).sum();
				return obj;
			}).filter(function(v) {
				return v.value > 0;
			}).reduce(function(obj, v) {
				obj[v.planet] = v;
				return obj;
			}, {});
			availableFreighters = availableFreighters.filter(function(v) {
				var p = v.planet;
				var planet = planets[p];
				var paths = planets[p].shortestPath;
				var fleet = v.fleet;
				var minStorage = fleet.ships.map(function(v, k) { if(v) return ships[k].maxStorage; }).filter(Boolean).min();

				// Add some variety to fleet destination choices
				var travelCosts = paths.map(function(v) { return v.distance * (1 + Math.random()); });

				var destinations = Object.values(pickupSources).filter(function(v) {
					return travelCosts[v.planet];
				}).sort(function(a, b) {
					var as = Math.min(minStorage, a.amount), bs = Math.min(minStorage, b.amount);
					return a.value - b.value || as - bs || travelCosts[b.planet] - travelCosts[a.planet];
				});
				while(destinations.length) {
					var destination = destinations.pop();

					if(destination.planet == p) continue;

					var maxAmount = destination.amount;
					var storageReserved = 0;
					var transportShips = fleet.ships.map(function(n, s) {
						var ship = ships[s];
						if(n == 0 || ship.maxStorage == 0) return 0;
						if(ship.maxStorage * n > maxAmount - storageReserved) n = Math.ceil((maxAmount - storageReserved) / ship.maxStorage);
						storageReserved += ship.maxStorage * n;
						return n;
					});

					destination.amount -= storageReserved;
					if(destination.amount <= 0) delete pickupSources[destination.planet];

					var transportFleet = fleet.divideFleet(p, transportShips, fleet.name);
					transportFleet.beginTransportMission(p, destination.planet);
					if(fleet === transportFleet) return false;
				}

				return true;
			});

			availableFreighters.map(function(v) {
				var p = v.planet;
				var paths = planets[p].shortestPath;
				var fleet = v.fleet;

				if(p != planetsName.santorini && game.searchPlanet(planetsName.santorini) && paths[planetsName.santorini]) {
					fleet.beginTransportMission(p, planetsName.santorini);
				} else if(p != planetsName.solidad && game.searchPlanet(planetsName.solidad) && paths[planetsName.solidad]) {
					fleet.beginTransportMission(p, planetsName.solidad);
				}
			});

			if("shipInterface" == currentInterface) $("#overview_button").click();
			if("travelingShipInterface" == currentInterface && "auto_delivery" == currentCriteriaAuto) exportTravelingShipInterface(currentCriteriaAuto);
		}
	}
	setInterval(doFreightMovement, 2*60*1000);
})();
