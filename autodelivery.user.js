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
				if(getBuildingsWanted) {
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
			availableFreighters.map(function(v) {
				var p = v.planet;
				var planet = planets[p];
				var paths = planets[p].shortestPath;
				var fleet = v.fleet;
				var minStorage = fleet.ships.map(function(v, k) { if(v) return ships[k].maxStorage; }).filter(Boolean).min();

				// Add some variety to fleet destination choices
				var travelCosts = paths.map(function(v) { return v.distance * (1 + Math.random()); });

				if(planetRequests[p]) {
					var excesses = planet.resources.sub(planetRequests[p]).filterInplace(function(v, k) {
						return v > minStorage;
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
						if(!hubs || !hubs.hasOwnProperty(k) || hubs[k] == p) return false;
						var locations = [ hubs[k] ];
						return {
							resource: k,
							amount: v,
							planets: locations,
						};
					}).filter(Boolean);
					var missions = Array();
					shortageMissions.map(function(v) {
						var resource = v.resource;

						v.planets.filter(function(p) {
							return isFinite(travelCosts[p]) && game.searchPlanet(p);
						}).map(function(p) {
							missions.push({
								planet: p,
								distance: travelCosts[p] + Math.random(),
								resource: resource,
								value: 2,
							});
						});
					});
					hubMissions.map(function(v) {
						var resource = v.resource;

						v.planets.filter(function(p) {
							return isFinite(travelCosts[p]) && game.searchPlanet(p);
						}).map(function(p) {
							missions.push({
								planet: p,
								distance: travelCosts[p] + Math.random(),
								resource: resource,
								value: 1,
							});
						});
					});
					missions.sort(function(a, b) { return a.value - b.value || b.distance - a.distance; });
					while(missions.length) {
						var mission = missions.pop();
						var missionRes = mission.resource;

						var maxAmount = planet.resources[missionRes] - planetRequests[p][missionRes];
						var minAmount = (shortages[missionRes] && shortages[missionRes][mission.planet]) || 0;
						if(hubs && hubs[missionRes] == mission.planet) minAmount = maxAmount;
						var storage = 0;
						var transportShips = fleet.ships.map(function(n, s) {
							var ship = ships[s];
							if(n == 0 || ship.maxStorage == 0) return 0;
							if(ship.maxStorage * n > maxAmount - storage) n = Math.floor((maxAmount - storage) / ship.maxStorage);
							if(ship.maxStorage * n > minAmount - storage) n = Math.ceil((minAmount - storage) / ship.maxStorage);
							storage += ship.maxStorage * n;
							return n;
						});
						if(storage == 0) continue;

						if(shortages[missionRes] && shortages[missionRes][mission.planet]) {
							shortages[missionRes][mission.planet] -= storage;
							if(shortages[missionRes][mission.planet] <= 0) delete shortages[missionRes][mission.planet];
							if(Object.keys(shortages[missionRes]).length == 0) delete shortages[missionRes];
						}

						var transport = Array();
						transport[missionRes] = storage;
						var transportFleet = fleet.divideFleet(p, transportShips, fleet.name);
						transportFleet.beginTransportMission(p, mission.planet, transport);
						if(fleet === transportFleet) return;
					}
				}

				var shortageRes = {};
				for(var k in shortages) for(var i in shortages[k]) if(paths[i]) shortageRes[k] = true;
				var hubRes = {};
				if(hubs) for(var k in hubs) if(paths[hubs[k]]) hubRes[k] = true;
				var destinations = travelCosts.map(function(v, k) {
					var obj = {
						planet: k,
						distance: v,
						value: 0,
					};
					if(!planetRequests[k]) return obj;

					var excesses = planets[k].resources.sub(planetRequests[k]);
					for(var i in shortageRes) {
						if(excesses[i] > minStorage) {
							obj.value = 2;
							obj.resource = i;
							obj.amount = excesses[i];
							return obj;
						}
					}
					for(var i in hubRes) {
						if(excesses[i] > minStorage && !(hubs && hubs[i] == k)) {
							obj.value = 1;
							obj.resource = i;
							obj.amount = excesses[i];
							return obj;
						}
					}
					return obj;
				}).filter(function(v) {
					return v.value > 0;
				}).sort(function(a, b) {
					return a.value - b.value || b.distance - a.distance;
				});
				var goneForResource = {};
				while(destinations.length) {
					var destination = destinations.pop();

					if(destination.planet == p) continue;
					if(goneForResource[destination.resource]) continue;
					goneForResource[destination.resource] = true;

					var maxAmount = destination.amount;
					var storage = 0;
					var transportShips = fleet.ships.map(function(n, s) {
						var ship = ships[s];
						if(n == 0 || ship.maxStorage == 0) return 0;
						if(ship.maxStorage * n > maxAmount - storage) n = Math.floor((maxAmount - storage) / ship.maxStorage);
						storage += ship.maxStorage * n;
						return n;
					});
					if(storage == 0) continue;

					var transportFleet = fleet.divideFleet(p, transportShips, fleet.name);
					transportFleet.beginTransportMission(p, destination.planet);
					if(fleet === transportFleet) return;
				}
				if(p != planetsName.santorini && game.searchPlanet(planetsName.santorini) && paths[planetsName.santorini]) {
					fleet.beginTransportMission(p, planetsName.santorini);
				} else if(p != planetsName.solidad && game.searchPlanet(planetsName.solidad) && paths[planetsName.solidad]) {
					fleet.beginTransportMission(p, planetsName.solidad);
				}
			});
			if("shipInterface" == currentInterface) $("#overview_button").click();
			if("travelingShipInterface" == currentInterface) exportTravelingShipInterface(currentCriteriaAuto);
		}
	}
	setInterval(doFreightMovement, 2*60*1000);
})();
