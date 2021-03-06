document.addEventListener("DOMContentLoaded", function() {
	'use strict';

	function arr(v) { return Array.prototype.slice.call(v); }
	function appendTo(a) { return function(b) { return a.appendChild(b); }; }
	function el(tag, contents) { var el = document.createElement(tag); if(contents) contents.map(appendTo(el)); return el; }
	function txt() { return document.createTextNode(arr(arguments).join()); }
	function div() { return el("div", arr(arguments)); }
	function span() { return el("span", arr(arguments)); }
	function label() { return el("label", arr(arguments)); }

	function selectElementContents(el) {
		if (window.getSelection && document.createRange) {
			var sel = window.getSelection();
			var range = document.createRange();
			range.selectNodeContents(el);
			sel.removeAllRanges();
			sel.addRange(range);
		} else if (document.selection && document.body.createTextRange) {
			var textRange = document.body.createTextRange();
			textRange.moveToElementText(el);
			textRange.select();
		}
	}

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
	function deserialize(str) {
		if(!str) return null;
		var data = str.split("&").map(function(str) {
			var parts = str.split("=", 2);
			if(parts[1] && parts[1].indexOf(":") != -1) {
				parts[1] = parts[1].split(",").map(function(str) {
					return str.split(":", 2);
				}).reduce(function(obj, add) {
					obj[add[0]] = add[1];
					return obj;
				}, {})
			}
			return parts;
		}).reduce(function(obj, add) {
			obj[add[0]] = add[1];
			return obj;
		}, {});
		if(data.ships || data.enemies) return data;
		return null;
	}
	function beautyObj(obj) {
		var a = [];
		for(var k in obj) {
			var v = obj[k];
			a.push(k + ": " + (typeof v === "number" ? beauty(v) : v));
		}
		return a.join("\n");
	}
	function dmgred(armor) {
		return 1 - 1 / (1 + Math.log(1 + armor / 1E4) / Math.log(2));
	}
	function speedred(def, atk, weight) {
		var a = def / atk * 4.6 / Math.log(weight) - 2;
		var b = 2 * a / (1 + Math.abs(2 * a));
		return .5 * (1.1 - .9 * b);
	}
	function shipSummaryData(ship, friend, foe) {
		var shipStats = {
			Power: ship.power,
			Piercing: (ship.piercing || 0),
			Armor: ship.armor,
			HP: ship.hp,
			Shield: ship.shield,
			"Piercing Power": ship.power * Math.min((ship.piercing || 0) / 100, 1),
			Toughness: ship.hp / (1 - dmgred(ship.armor)),
			Speed: ship.speed,
			Weight: ship.combatWeight,
		};
		if(friend) {
			var bonus = fleetBonus(friend);
			var fleetWeight = friend.combatWeight();
			shipStats.Power *= bonus.power;
			shipStats.Armor *= bonus.armor;
			shipStats["Piercing Power"] *= bonus.power;
			shipStats.Toughness = ship.hp / (1 - dmgred(shipStats.Armor));
			shipStats.Speed *= bonus.speed;
			shipStats.Duration = (1 + fleetWeight / ship.combatWeight);
		}
		if(foe) {
			var bonus = fleetBonus(foe);
			var fleetWeight = foe.combatWeight();
			var netEffect = foe.ships.map(function(n, k) {
				if(n == 0) return {};
				var enemyShip = ships[k];
				var result = {};
				var shipDR = Math.min(shipStats.HP / shipStats.Toughness + (enemyShip.piercing || 0) / 100, 1);
				var enemyDR = Math.min(1 - dmgred(enemyShip.armor * bonus.armor) + (shipStats.Piercing) / 100, 1);
				if(ship.shield) shipDR *= (1 - ship.shield/Math.max(enemyShip.power, ship.shield));
				if(enemyShip.shield) enemyDR *= (1 - enemyShip.shield/Math.max(ship.power, enemyShip.shield));
				result.power = n * enemyShip.power * bonus.power;
				result.harm = speedred(shipStats.Speed, enemyShip.speed * bonus.speed, shipStats.Weight) * result.power * shipDR / shipStats.HP;
				result.toughness = n * enemyShip.hp / (1 - dmgred(enemyShip.armor * bonus.armor));
				var piercingBonus = result.toughness * enemyDR / (n * enemyShip.hp);
				var modifiedPower = speedred(enemyShip.speed * bonus.speed, shipStats.Speed, enemyShip.combatWeight) * piercingBonus * shipStats.Power;
				result.effect = result.toughness / modifiedPower;
				if(isNaN(result.harm)) result.harm = Infinity;
				if(isNaN(result.effect)) result.effect = 0;
				return result;
			}).reduce(function(obj, v) {
				for(var k in v) obj[k] += v[k];
				return obj;
			}, {
				power: 0,
				harm: 0,
				toughness: 0,
				effect: 0,
			});
			if(netEffect.harm) shipStats["Adjusted Toughness"] = netEffect.power / netEffect.harm;
			if(netEffect.harm && shipStats.Duration) shipStats.Duration /= netEffect.harm;
			if(netEffect.effect) shipStats["Killing Power"] = netEffect.toughness / netEffect.effect;
		}
		return shipStats;
	}
	function shipSummary(ship, friend, foe) {
		var shipStats = shipSummaryData(ship, friend, foe)
		var fleetStats = friend ? fleetSummaryData(friend, foe) : {};
		if(ship.id == 14) {
			if(friend) {
				var precount = friend.ships[ship.id];
				var bonusChange = (1 + .1 * Math.log2(2 + precount)) / (1 + .1 * Math.log2(1 + precount));
				shipStats.Power *= bonusChange;
				shipStats.Power += fleetStats.Power * (bonusChange - 1);
				shipStats["Killing Power"] *= bonusChange;
				shipStats["Killing Power"] += fleetStats["Killing Power"] * (bonusChange - 1);
			} else {
				shipStats.Power *= 1.1;
				shipStats["Killing Power"] *= 1.1;
			}
		}
		for(var k in fleetStats) if(fleetStats[k]) shipStats[k] = beauty(shipStats[k])+" ("+beauty(friend.ships[ship.id] * shipStats[k] / fleetStats[k] * 100)+"%)";
		return beautyObj(shipStats);
	}
	function fleetSummaryData(friend, foe) {
		return friend.ships.map(function(n, k) {
			if(n == 0) return false;
			var ship = ships[k];
			var shipStats = shipSummaryData(ship, friend, foe);
			shipStats.Count = n;
			return shipStats;
		}).filter(Boolean).map(function(v) {
			for(var k in v) v[k] *= v.Count;
			delete v.Speed; delete v.Duration; delete v.Count;
			return v;
		}).reduce(function(obj, v) {
			for(var k in v) obj[k] += v[k];
			return obj;
		}, {
			Power: 0,
			Armor: 0,
			HP: 0,
			Toughness: 0,
			"Piercing Power": 0,
			"Adjusted Toughness": 0,
			Weight: 0,
			"Killing Power": 0,
		});
	}
	function writeFleetSummary(container, friend, foe) {
		while(container.lastChild) container.removeChild(container.lastChild);

		var fleetData = fleetSummaryData(friend, foe);
		var tooltips = {
			Power: "Total Power of all ships in fleet",
			Armor: "Total Armor of all ships in fleet",
			HP: "Total HP of all ships in fleet",
			Toughness: "Effective HP of fleet after Armor bonuses",
			"Piercing Power": "Amount of direct HP damage this fleet deals due to armor piercing",
			"Adjusted Toughness": "Total amount of raw Power this fleet can absorb before dying",
			Weight: "Total mass of ships damage is spread across (helps to keep weaker ships alive)",
			"Killing Power": "Progress toward killing the enemy outright (opposes enemy Toughness)",
		};
		for(var k in fleetData) {
			if(!tooltips[k]) continue;
			var v = fleetData[k];
			var row = div(txt(k + ": " + (typeof v === "number" ? beauty(v) : v)));
			row.title = tooltips[k];
			container.appendChild(row);
		}
	}
	function fleetBonus(fleet) {
		var bonus = {
			power: 1,
			armor: 1,
			speed: 1,
		};
		["ammunition", "u-ammunition", "t-ammunition"].map(function(name) {
			var resource = resourcesName[name];
			bonus.power += calcBonus[name](fleet.storage[resource.id]);
		});
		bonus.power *= (1 + .1 * Math.log(1 + fleet.ships[14]) / Math.log(2));
		["armor"].map(function(name) {
			var resource = resourcesName[name];
			bonus.armor += calcBonus[name](fleet.storage[resource.id]);
		});
		["engine"].map(function(name) {
			var resource = resourcesName[name];
			bonus.speed += calcBonus[name](fleet.storage[resource.id]);
		});
		return bonus;
	}
	function fleetStats(fleet, enemy) {
		var power = 0,
		    armor = 0,
		    hp = 0,
		    threat = 0,
		    toughness = 0,
		    piercepower = 0,
		    speedpower = 0,
		    speedtough = 0,
		    rawpower = 0,
		    rawtough = 0;
		var bonus = fleetBonus(fleet);
		fleet.ships.map(function(n, k) {
			if(n == 0) return;
			var ship = ships[k];
			power += n * ship.power * bonus.power;
			piercepower += power * (ship.piercing || 0) / 100,
			armor += n * ship.armor * bonus.armor;
			hp += n * ship.hp;
			var shiptough = ship.hp / (1 - dmgred(ship.armor * bonus.armor));
			var piercingbonus = Math.min(1 + 10 * (ship.piercing || 0) / 100, 10);
			threat += (n+1) * ship.power * bonus.power;
			toughness += n * shiptough;
			speedpower += (n+1) * ship.power * piercingbonus * bonus.power * speedred(1, ship.speed * bonus.speed, 100000);
			speedtough += n * shiptough / speedred(ship.speed * bonus.speed, 1, ship.combatWeight);
		});
		return {
			Power: power,
			"Piercing Power": piercepower,
			Armor: armor,
			HP: hp,
			Toughness: toughness,
			Value: Math.sqrt(speedpower * speedtough),
		};
	}
	function shipinput(ship, n) {
		var label = span(txt(ship.name));
		label.title = shipSummary(ship);
		var input = el("input");
		input.type = "text";
		input.label = label;
		input.ship = ship;
		if(typeof n !== "undefined") input.value = n;
		input.showLosses = span();
		return div(label, input, input.showLosses);
	}
	function shipselector() {
		var pick_new_ship = el("select");
		available_ships.map(function(ship, k) {
			var option = el("option");
			option.value = k;
			option.innerText = ship.name;
			option.ship = ship;
			return option;
		}).map(appendTo(pick_new_ship));
		var add_new_ship = el("input");
		add_new_ship.type = "button";
		add_new_ship.value = "Add Ship";
		var row = div(span(pick_new_ship), add_new_ship);
		add_new_ship.onclick = function() {
			var i = pick_new_ship.selectedIndex;
			if(i == -1) return;
			var o = pick_new_ship.options[i];
			var parent = row.parentNode;
			parent.removeChild(row);
			parent.appendChild(shipinput(o.ship));
			delete available_ships[o.value];
			parent.appendChild(shipselector(available_ships));
		};
		return row;
	}
	function inputval(input) {
		delete input.title;
		input.setCustomValidity("");

		var value = input.value;
		try {
			value = eval(value);
		} catch(e) {
			input.title = e.message;
			input.setCustomValidity(e.message);
		}
		return parseInt(value) || 0;
	}

	var saveData;
	try {
		saveData = history.state || deserialize(window.location.hash.substring(1)) || JSON.parse(localStorage.getItem("battlecalc-persist")) || {};
	} catch(e) {
		console.log(e);
		saveData = {};
	};
	window.history.replaceState(saveData, document.title, window.location.pathname);

	var shiplist = document.getElementById("shiplist");
	var available_ships = ships.slice();
	game.ships.map(function(ship) {
		var n;
		if(saveData.ships && saveData.ships[ship.id]) n = saveData.ships[ship.id];
		else if(ship.type === "Colonial Ship" || ship.type === "Cargoship") return;
		shiplist.appendChild(shipinput(ship, n));
		delete available_ships[ship.id];
	});
	saveData.ships && Object.keys(saveData.ships).map(function(k) {
		if(!available_ships[k]) return;
		var n = saveData.ships[k];
		shiplist.appendChild(shipinput(ships[k], n));
		delete available_ships[k];
	});
	shiplist.appendChild(shipselector());

	shiplist.statBlock = span();
	shiplist.statBlock.className = "statblock";
	shiplist.statBlock.title = "Total resource value of your fleet";
	shiplist.parentNode.appendChild(shiplist.statBlock);
	shiplist.statBlockCombat = span();
	shiplist.statBlockCombat.className = "statblock combat";
	shiplist.parentNode.appendChild(shiplist.statBlockCombat);

	var stufflist = document.getElementById("stufflist");
	["ammunition", "u-ammunition", "t-ammunition", "armor", "engine"].map(function(name) {
		var resource = resourcesName[name];
		var label = span(txt(name.capitalize()));
		var input = el("input");
		input.type = "text";
		input.label = label;
		input.name = name;
		if(saveData.bonuses && saveData.bonuses[name]) input.value = saveData.bonuses[name];
		input.resource = resource;
		input.showValue = span();
		return div(label, input, input.showValue);
	}).map(appendTo(stufflist));
	["artofwar", "karan_artofwar"].map(function(name) {
		var research = researches[researchesName[name]];
		var label = span(txt(research.name));
		var input = el("input");
		input.type = "text";
		input.name = name;
		if(saveData.bonuses && saveData.bonuses[name]) input.value = saveData.bonuses[name];
		input.research = research;
		return div(label, input);
	}).map(appendTo(stufflist));
	var calcBonus = {
		"ammunition": function(v) { return 10 * Math.log(1 + v / 1E7)/Math.log(2); },
		"u-ammunition": function(v) { return 20 * Math.log(1 + v / 1E7)/Math.log(2); },
		"t-ammunition": function(v) { return 60 * Math.log(1 + v / 2E7)/Math.log(2); },
		"armor": function(v) { return v / 2e6; },
		"engine": function(v) { return v / 5e6; },
	};

	stufflist.statBlock = span();
	stufflist.statBlock.className = "statblock only";
	stufflist.parentNode.appendChild(stufflist.statBlock);
	var resourcelosses = span();
	resourcelosses.className = "statblock combat only";
	resourcelosses.title = "Total resources lost in this fight (ships and inventory)";
	stufflist.parentNode.appendChild(resourcelosses);

	var enemylist = document.getElementById("enemylist");
	var enemypicker = el("select");
	planets.map(function(planet) {
		for(var k in planet.fleets) {
			var fleet = planet.fleets[k];
			if(!fleet.combatWeight()) continue;
			var text = planet.name + " - " + fleet.name;
			var option = el("option");
			option.innerText = text;
			option.value = planet.id + "_" + k;
			option.fleet = fleet;
			enemypicker.appendChild(option);
		}
	});
	arr(enemypicker.options).sort(function(a, b) { return fleetStats(a.fleet).Value - fleetStats(b.fleet).Value; }).map(appendTo(enemypicker));
	enemylist.parentNode.insertBefore(div(span(txt("Enemy Fleet")), enemypicker), enemylist);
	if(isFinite(saveData.enemySelected)) enemypicker.selectedIndex = saveData.enemySelected;
	else if(saveData.enemySelected) enemypicker.value = saveData.enemySelected;
	enemypicker.onchange = function() {
		var i = enemypicker.selectedIndex;
		if(i == -1) return;
		var parent = enemypicker.parentNode;
		while(enemylist.lastChild) enemylist.removeChild(enemylist.lastChild);
		var o = enemypicker.options[i];
		o.fleet.ships.map(function(n, k) {
			if(!n) return;
			var ship = ships[k];
			enemylist.appendChild(shipinput(ship, n));
		});
	};
	enemypicker.onchange();
	if(saveData.enemies) {
		arr(enemylist.getElementsByTagName("input")).map(function(input) {
			input.value = saveData.enemies[input.ship.id] || "";
			delete saveData.enemies[input.ship.id];
		});
		Object.keys(saveData.enemies).map(function(k) {
			if(!ships[k]) return;
			var n = saveData.enemies[k];
			enemylist.appendChild(shipinput(ships[k], n));
		});
	}

	enemylist.statBlock = span();
	enemylist.statBlock.className = "statblock";
	enemylist.statBlock.title = "Total resource value of enemy fleet";
	enemylist.parentNode.appendChild(enemylist.statBlock);
	enemylist.statBlockCombat = span();
	enemylist.statBlockCombat.className = "statblock combat";
	enemylist.parentNode.appendChild(enemylist.statBlockCombat);

	function loadSaveData(saveData) {
		saveData.ships && arr(shiplist.getElementsByTagName("input")).map(function(input) {
			if(!input.ship) return;
			input.value = saveData.ships[input.ship.id] || "";
		});
		saveData.ships && Object.keys(saveData.ships).map(function(k) {
			if(!available_ships[k]) return;
			var n = saveData.ships[k] || "";
			shiplist.appendChild(shipinput(ships[k], n));
			delete available_ships[k];
		});
		saveData.bonuses && arr(stufflist.getElementsByTagName("input")).map(function(input) {
			input.value = saveData.bonuses[input.name] || "";
		});
		if(saveData.enemySelected) {
			if(isFinite(saveData.enemySelected)) enemypicker.selectedIndex = saveData.enemySelected;
			else enemypicker.value = saveData.enemySelected;
			enemypicker.onchange();
		}
		saveData.enemies && arr(enemylist.getElementsByTagName("input")).map(function(input) {
			if(!input.ship) return;
			input.value = saveData.enemies[input.ship.id] || "";
			delete saveData.enemies[input.ship.id];
		});
		saveData.enemies && Object.keys(saveData.enemies).map(function(k) {
			if(!ships[k]) return;
			var n = saveData.enemies[k] || "";
			enemylist.appendChild(shipinput(ships[k], n));
		});
	}

	window.onhashchange = function() {
		saveData = deserialize(window.location.hash.substring(1));
		if(!saveData) return;

		loadSaveData(saveData);

		update();
	};

	window.onpopstate = function(e) {
		saveData = e.state;
		if(!saveData) return;

		loadSaveData(saveData);

		update();
	};

	var exporter = document.getElementById("exporter");
	exporter.onclick = function() {
		selectElementContents(this);
		if(document.execCommand) document.execCommand("copy");
	};

	var nextrun = document.getElementById("nextrun");
	if(window.name) nextrun.target = window.name+"+";

	var battlereport = document.getElementById("battlereport");
	var update = document.getElementById("battlecalc").onchange = function() {
		saveData = {
			ships: {},
			bonuses: {},
			enemies: {},
		};

		var warfleet = new Fleet(0, "Simulation");
		arr(shiplist.getElementsByTagName("input")).map(function(input) {
			var val = inputval(input);
			if(val > 0) warfleet.ships[input.ship.id] = saveData.ships[input.ship.id] = val;
		});
		arr(stufflist.getElementsByTagName("input")).map(function(input) {
			var val = inputval(input);
			if(input.resource) {
				warfleet.storage[input.resource.id] = val;
				input.showValue.innerText = "+"+beauty(calcBonus[input.resource.name](warfleet.storage[input.resource.id])) + "x";
			} else if(input.research) {
				var newLevel = val;
				while(input.research.level > newLevel) { input.research.level--; input.research.unbonus(); }
				while(input.research.level < newLevel) { input.research.level++; input.research.bonus(); }
			}
			if(val > 0) saveData.bonuses[input.name] = val;
		});
		var enemy = new Fleet(1, "Test Dummy");
		saveData.enemySelected = enemypicker.value;
		arr(enemylist.getElementsByTagName("input")).map(function(input) {
			var val = inputval(input);
			if(val > 0) enemy.ships[input.ship.id] = saveData.enemies[input.ship.id] = val;
		});

		arr(stufflist.getElementsByTagName("input")).filter(function(input) {
			return input.resource && input.label;
		}).reduce(function(fleetRealStats, input) {
			var val = warfleet.storage[input.resource.id];
			warfleet.storage[input.resource.id]++;
			var fleetPlusStats = fleetSummaryData(warfleet, enemy);
			warfleet.storage[input.resource.id] = 0;
			var fleetPreStats = fleetSummaryData(warfleet, enemy);
			warfleet.storage[input.resource.id] = val;

			var changes = {};
			for(var k in fleetRealStats) {
				var a = fleetPreStats[k],
				    b = fleetRealStats[k] - a,
				    c = fleetPlusStats[k] - a - b;
				if(b || c) changes[k] = beauty(b) + " (+" + beauty(c) + ")";
			}
			input.label.title = beautyObj(changes);

			return fleetRealStats;
		}, fleetSummaryData(warfleet, enemy));

		shiplist.statBlock.innerText = beautyObj(warfleet.ships.reduce(function(obj, n, k) {
			if(n === 0) return obj;
			ships[k].cost.map(function(v, i) {
				if(!v) return;
				var resName = resources[i].name.capitalize();
				obj[resName] = (obj[resName] || 0) + n * v;
			})
			return obj;
		}, {}));
		writeFleetSummary(shiplist.statBlockCombat, warfleet, enemy);
		stufflist.statBlock.innerText = beautyObj({
			"Max Storage": warfleet.maxStorage(),
			"Used Storage": warfleet.usedStorage(),
		});
		enemylist.statBlock.innerText = beautyObj(enemy.ships.reduce(function(obj, n, k) {
			if(n === 0) return obj;
			ships[k].cost.map(function(v, i) {
				if(!v) return;
				var resName = resources[i].name.capitalize();
				obj[resName] = (obj[resName] || 0) + n * v;
			})
			return obj;
		}, {}));
		writeFleetSummary(enemylist.statBlockCombat, enemy, warfleet);

		var warfleetNetWorth = warfleet.ships.reduce(function(arr, n, k) {
			if(n === 0) return arr;
			ships[k].cost.map(function(v, i) {
				arr[i] += n * v;
			})
			return arr;
		}, warfleet.storage.slice());

		arr(shiplist.getElementsByTagName("input")).map(function(input) {
			if(input.type === "button") return;
			input.label.title = shipSummary(input.ship, warfleet, enemy);
		});
		arr(enemylist.getElementsByTagName("input")).map(function(input) {
			input.label.title = shipSummary(input.ship, enemy, warfleet);
		});

		battlereport.innerHTML = enemy.battle(warfleet).r;
		arr(shiplist.getElementsByTagName("input")).map(function(input) {
			if(input.type === "button") return;
			input.showLosses.innerText = warfleet.ships[input.ship.id];
		});
		shiplist.dataset.weightRemaining = warfleet.combatWeight();
		arr(enemylist.getElementsByTagName("input")).map(function(input) {
			input.showLosses.innerText = enemy.ships[input.ship.id];
		});
		enemylist.dataset.weightRemaining = enemy.combatWeight();

		stufflist.statBlock.innerText += "\n" + beautyObj({
			"Surviving Storage": warfleet.maxStorage(),
		});

		var warfleetRemainingNetWorth = warfleet.ships.reduce(function(arr, n, k) {
			if(n === 0) return arr;
			ships[k].cost.map(function(v, i) {
				arr[i] += n * v;
			})
			return arr;
		}, warfleet.storage.slice());
		resourcelosses.innerText = beautyObj(warfleetNetWorth.reduce(function(obj, v, i) {
			if(v === 0) return obj;
			var l = v - warfleetRemainingNetWorth[i];
			var resName = resources[i].name.capitalize();
			obj[resName] = beauty(l) + " (" + beauty(l / v * 100)+"%)";
			return obj;
		}, {}));

		var basePath = location.protocol+'//'+location.host+location.pathname;
		exporter.href = exporter.firstChild.alt = basePath+"#"+serialize(saveData);
		window.history.replaceState(saveData, document.title, window.location.hash ? exporter.href : window.location.pathname);
		localStorage.setItem("battlecalc-persist", JSON.stringify(saveData));

		nextrun.href = basePath+"#"+serialize({
			ships: warfleet.ships.reduce(function(obj, v, k) { if(v > 0) obj[k] = v; return obj; }, {}),
			bonuses: ["artofwar", "karan_artofwar"].reduce(function(obj, name) {
				var research = researches[researchesName[name]];
				var v = research.level;
				if(v > 0) obj[name] = v;
				return obj;
			}, (warfleet.combatWeight() ? ["ammunition", "u-ammunition", "t-ammunition", "armor", "engine"] : []).reduce(function(obj, name) {
				var resource = resourcesName[name];
				var v = warfleet.storage[resource.id];
				if(v > 0) obj[name] = v;
				return obj;
			}, {})),
			enemySelected: enemypicker.selectedIndex + (enemy.combatWeight() ? 0 : 1),
			enemies: enemy.ships.reduce(function(obj, v, k) { if(v > 0) obj[k] = v; return obj; }, {}),
		});
	};
	update();
});
