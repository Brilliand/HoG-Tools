document.addEventListener("DOMContentLoaded", function() {
	function arr(v) { return Array.prototype.slice.call(v); }
	function appendTo(a) { return function(b) { return a.appendChild(b); }; }
	function el(tag, contents) { var el = document.createElement(tag); if(contents) contents.map(appendTo(el)); return el; }
	function txt() { return document.createTextNode(arr(arguments).join()); }
	function div() { return el("div", arr(arguments)); }
	function span() { return el("span", arr(arguments)); }
	function label() { return el("label", arr(arguments)); }

	function serialize(obj) {
		return Object.keys(obj).map(function(k) {
			if(typeof obj[k] === "object") {
				section = obj[k];
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
			if(parts[1].indexOf(":") != -1) {
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
		if(data.ships) return data;
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
	function shipSummary(ship) {
		var armorInv = arr(document.getElementsByName("armor")).map(function(input) { return input.value; }).reduce(function(a, b) { return a + b; });
		var armorMult = 1 + armorInv / 2e6;
		return beautyObj({
			Power: ship.power,
			Armor: ship.armor,
			HPs: ship.hp,
			"Dmg Reduction": (dmgred(ship.armor * armorMult) * 100).toFixed(2) + "%",
			Speed: ship.speed,
			Weight: ship.weight,
		});
	}
	function fleetStats(fleet) {
		var power = 0,
		    armor = 0,
		    hp = 0,
		    threat = 0,
		    toughness = 0,
		    speedpower = 0,
		    speedtough = 0,
		    rawpower = 0,
		    rawtough = 0;
		var powermult = 1,
		    armormult = 1,
		    speedmult = 1;
		["ammunition", "u-ammunition", "t-ammunition"].map(function(name) {
			var resource = resourcesName[name];
			powermult += calcBonus[name](fleet.storage[resource.id]);
		});
		powermult *= (1 + .1 * Math.log(1 + fleet.ships[14]) / Math.log(2));
		["armor"].map(function(name) {
			var resource = resourcesName[name];
			armormult += calcBonus[name](fleet.storage[resource.id]);
		});
		["engine"].map(function(name) {
			var resource = resourcesName[name];
			speedmult += calcBonus[name](fleet.storage[resource.id]);
		});
		fleet.ships.map(function(n, k) {
			if(n == 0) return;
			var ship = ships[k];
			power += n * ship.power * powermult;
			armor += n * ship.armor * armormult;
			hp += n * ship.hp;
			var shiptough = ship.hp / (1 - dmgred(ship.armor * armormult));
			threat += (n+1) * ship.power * powermult * (.5 * (1.1 + .9 * 0.8));
			toughness += n * shiptough / (.5 * (1.1 + .9 * 0.8));
			speedpower += (n+1) * ship.power * powermult * speedred(1, ship.speed * speedmult, 100000);
			speedtough += n * shiptough / speedred(ship.speed * speedmult, 1, ship.weight);
			rawpower += (n+1) * ship.power * speedred(1, ship.speed, 100000);
			rawtough += n * ship.hp / (1 - dmgred(ship.armor)) / speedred(ship.speed, 1, ship.weight);
		});
		return {
			Power: power,
			Armor: armor,
			HP: hp,
			Toughness: toughness,
			"Speed Adjustment": (Math.sqrt(speedpower * speedtough || 1) / Math.sqrt(threat * toughness || 1) * 100).toFixed(2)+"%",
			"Ship Value": Math.sqrt(rawpower * rawtough),
			"Inventory Adjustment": "x"+beauty(Math.sqrt(speedpower * speedtough || 1) / Math.sqrt(rawpower * rawtough || 1)),
			Value: Math.sqrt(speedpower * speedtough),
		};
	}
	function shipinput(ship, n) {
		var label = span(txt(ship.name));
		label.onmouseover = function() { this.title = shipSummary(ship); };
		var input = el("input");
		input.type = "number";
		input.min = 0;
		input.ship = ship;
		input.value = n;
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

	var saveData;
	try {
		saveData = deserialize(window.location.hash.substring(1)) || JSON.parse(localStorage.getItem("battlecalc-persist")) || {};
	} catch(e) {
		console.log(e);
		saveData = {};
	};
	if(window.location.hash) {
		window.history.replaceState({}, document.title, window.location.pathname);
	}

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
	shiplist.parentNode.appendChild(shiplist.statBlock);
	shiplist.statBlockAfter = span();
	shiplist.statBlockAfter.className = "statblock outcome";
	shiplist.parentNode.appendChild(shiplist.statBlockAfter);

	var stufflist = document.getElementById("stufflist");
	["ammunition", "u-ammunition", "t-ammunition", "armor", "engine"].map(function(name) {
		var resource = resourcesName[name];
		var input = el("input");
		input.type = "number";
		input.min = 0;
		input.name = name;
		if(saveData.bonuses && saveData.bonuses[name]) input.value = saveData.bonuses[name];
		input.resource = resource;
		input.showValue = span();
		return div(span(txt(name)), input, input.showValue);
	}).map(appendTo(stufflist));
	["artofwar"].map(function(name) {
		var research = researches[researchesName[name]];
		var input = el("input");
		input.type = "number";
		input.min = 0;
		input.max = 100;
		input.name = name;
		if(saveData.bonuses && saveData.bonuses[name]) input.value = saveData.bonuses[name];
		input.research = research;
		return div(span(txt(research.name)), input);
	}).map(appendTo(stufflist));
	var calcBonus = {
		"ammunition": function(v) { return 10 * Math.log(1 + v / 1E7)/Math.log(2); },
		"u-ammunition": function(v) { return 20 * Math.log(1 + v / 1E7)/Math.log(2); },
		"t-ammunition": function(v) { return 60 * Math.log(1 + v / 2E7)/Math.log(2); },
		"armor": function(v) { return v / 2e6; },
		"engine": function(v) { return v / 5e6; },
	};

	var enemylist = document.getElementById("enemylist");
	var enemypicker = el("select");
	planets.map(function(planet) {
		for(var k in planet.fleets) {
			var fleet = planet.fleets[k];
			if(!fleet.weight()) continue;
			var text = planet.name + " - " + fleet.name;
			var option = el("option");
			option.innerText = text;
			option.fleet = fleet;
			enemypicker.appendChild(option);
		}
	});
	arr(enemypicker.options).sort(function(a, b) { return fleetStats(a.fleet).Value - fleetStats(b.fleet).Value; }).map(appendTo(enemypicker));
	enemylist.parentNode.insertBefore(div(span(txt("Enemy Fleet")), enemypicker), enemylist);
	if(saveData.enemySelected) enemypicker.selectedIndex = saveData.enemySelected;
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
			input.value = saveData.enemies[input.ship.id];
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
	enemylist.parentNode.appendChild(enemylist.statBlock);
	enemylist.statBlockAfter = span();
	enemylist.statBlockAfter.className = "statblock outcome";
	enemylist.parentNode.appendChild(enemylist.statBlockAfter);

	window.onhashchange = function() {
		saveData = deserialize(window.location.hash.substring(1)) || {};

		saveData.ships && arr(shiplist.getElementsByTagName("input")).map(function(input) {
			input.value = saveData.ships[input.ship.id];
		});
		saveData.ships && Object.keys(saveData.ships).map(function(k) {
			if(!available_ships[k]) return;
			var n = saveData.ships[k];
			shiplist.appendChild(shipinput(ships[k], n));
			delete available_ships[k];
		});
		saveData.bonuses && arr(stufflist.getElementsByTagName("input")).map(function(input) {
			input.value = saveData.bonuses[input.name];
		});
		if(saveData.enemySelected) {
			enemypicker.selectedIndex = saveData.enemySelected;
			enemypicker.onchange();
		}
		saveData.enemies && arr(enemylist.getElementsByTagName("input")).map(function(input) {
			input.value = saveData.enemies[input.ship.id];
			delete saveData.enemies[input.ship.id];
		});
		saveData.enemies && Object.keys(saveData.enemies).map(function(k) {
			if(!ships[k]) return;
			var n = saveData.enemies[k];
			enemylist.appendChild(shipinput(ships[k], n));
		});
		window.history.replaceState({}, document.title, window.location.pathname);
		update();
	};

	var battlereport = document.getElementById("battlereport");
	var exporter = document.getElementById("exporter");
	var update = document.getElementById("battlecalc").onchange = function() {
		saveData = {
			ships: {},
			bonuses: {},
			enemies: {},
		};

		var warfleet = new Fleet(0, "Simulation");
		arr(shiplist.getElementsByTagName("input")).map(function(input) {
			if(input.value > 0) warfleet.ships[input.ship.id] = saveData.ships[input.ship.id] = Number(input.value);
		});
		arr(stufflist.getElementsByTagName("input")).map(function(input) {
			if(input.resource) {
				warfleet.storage[input.resource.id] = Number(input.value);
				input.showValue.innerText = "+"+beauty(calcBonus[input.resource.name](warfleet.storage[input.resource.id])) + "x";
			} else if(input.research) {
				var newLevel = Number(input.value);
				while(input.research.level > newLevel) { input.research.level--; input.research.unbonus(); }
				while(input.research.level < newLevel) { input.research.level++; input.research.bonus(); }
			}
			if(input.value > 0) saveData.bonuses[input.name] = Number(input.value);
		});
		shiplist.statBlock.innerText = beautyObj(fleetStats(warfleet));
		var enemy = new Fleet(1, "Test Dummy");
		saveData.enemySelected = enemypicker.selectedIndex;
		arr(enemylist.getElementsByTagName("input")).map(function(input) {
			if(input.value > 0) enemy.ships[input.ship.id] = saveData.enemies[input.ship.id] = Number(input.value);
		});
		enemylist.statBlock.innerText = beautyObj(fleetStats(enemy));

		battlereport.innerHTML = enemy.battle(warfleet).r;
		arr(shiplist.getElementsByTagName("input")).map(function(input) {
			if(input.type === "button") return;
			input.showLosses.innerText = warfleet.ships[input.ship.id];
		});
		shiplist.statBlockAfter.innerText = beautyObj(fleetStats(warfleet));
		shiplist.dataset.weightRemaining = warfleet.weight();
		arr(enemylist.getElementsByTagName("input")).map(function(input) {
			input.showLosses.innerText = enemy.ships[input.ship.id];
		});
		enemylist.statBlockAfter.innerText = beautyObj(fleetStats(enemy));
		enemylist.dataset.weightRemaining = enemy.weight();

		var basePath = location.protocol+'//'+location.host+location.pathname;
		exporter.href = exporter.firstChild.alt = basePath+"#"+serialize(saveData);
		localStorage.setItem("battlecalc-persist", JSON.stringify(saveData));
	};
	update();
});
