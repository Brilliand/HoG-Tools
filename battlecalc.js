document.addEventListener("DOMContentLoaded", function() {
	function arr(v) { return Array.prototype.slice.call(v); }
	function appendTo(a) { return function(b) { return a.appendChild(b); }; }
	function el(tag, contents) { var el = document.createElement(tag); if(contents) contents.map(appendTo(el)); return el; }
	function txt() { return document.createTextNode(arr(arguments).join()); }
	function div() { return el("div", arr(arguments)); }
	function span() { return el("span", arr(arguments)); }
	function label() { return el("label", arr(arguments)); }

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
	function shipSummary(ship) {
		return beautyObj({
			Power: ship.power,
			Armor: ship.armor,
			HPs: ship.hp,
			"Dmg Reduction": (dmgred(ship.armor) * 100).toFixed(2) + "%",
			Speed: ship.speed,
			Weight: ship.weight,
		});
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

	var shiplist = document.getElementById("shiplist");
	var available_ships = ships.slice();
	game.ships.map(function(ship, k) {
		if(ship.type === "Colonial Ship" || ship.type === "Cargoship") return;
		shiplist.appendChild(shipinput(ship));
		delete available_ships[ship.id];
	});
	shiplist.appendChild(shipselector());

	var stufflist = document.getElementById("stufflist");
	["ammunition", "u-ammunition", "t-ammunition", "armor", "engine"].map(function(name) {
		var resource = resourcesName[name];
		var input = el("input");
		input.type = "number";
		input.min = 0;
		input.name = name;
		input.resource = resource;
		return div(span(txt(name)), input);
	}).map(appendTo(stufflist));
	["artofwar"].map(function(name) {
		var research = researches[researchesName[name]];
		var input = el("input");
		input.type = "number";
		input.min = 0;
		input.max = 100;
		input.name = name;
		input.research = research;
		return div(span(txt(research.name)), input);
	}).map(appendTo(stufflist));

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
	arr(enemypicker.options).sort(function(a, b) { return a.fleet.value() - b.fleet.value(); }).map(appendTo(enemypicker));
	enemylist.parentNode.insertBefore(div(span(txt("Enemy Fleet")), enemypicker), enemylist);
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

	var battlereport = document.getElementById("battlereport");
	document.getElementById("battlecalc").onchange = function() {
		var warfleet = new Fleet(0, "Simulation");
		arr(shiplist.getElementsByTagName("input")).map(function(input) {
			if(input.value > 0) warfleet.ships[input.ship.id] = Number(input.value);
		});
		arr(stufflist.getElementsByTagName("input")).map(function(input) {
			if(input.resource) {
				warfleet.storage[input.resource.id] = Number(input.value);
			} else if(input.research) {
				var newLevel = Number(input.value);
				while(input.research.level > newLevel) { input.research.level--; input.research.unbonus(); }
				while(input.research.level < newLevel) { input.research.level++; input.research.bonus(); }
			}
		});
		var enemy = new Fleet(1, "Test Dummy");
		arr(enemylist.getElementsByTagName("input")).map(function(input) {
			if(input.value > 0) enemy.ships[input.ship.id] = Number(input.value);
		});
		battlereport.innerHTML = enemy.battle(warfleet).r;
		arr(shiplist.getElementsByTagName("input")).map(function(input) {
			if(input.type === "button") return;
			input.showLosses.innerText = warfleet.ships[input.ship.id];
		});
		shiplist.dataset.weightRemaining = warfleet.weight();
		arr(enemylist.getElementsByTagName("input")).map(function(input) {
			input.showLosses.innerText = enemy.ships[input.ship.id];
		});
		enemylist.dataset.weightRemaining = enemy.weight();
	};
});
