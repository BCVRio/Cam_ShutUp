--!strict
-- The catalogue of things you can buy, place and nick in Nunhead.
--
-- Each entry:
--   Id        stable key used for saves, icons and meshes
--   Name      display name
--   Rarity    see Rarity.luau
--   Price     cost on the conveyor
--   Income    cash per second when placed on a pedestal
--   Blurb     one-line flavour text shown in the UI
--   Visual    how CollectibleFactory builds it from parts when no mesh is available
--             Builder: Animal | Bird | Cup | Cone | Crate | Blob | Sign | Statue | Vehicle | Building | Umbrella | Bike | Piano | Gate | Tower | Disk
--             Primary / Secondary / Accent: {r,g,b} 0-255
--             Scale: overall size multiplier (1 = roughly player-sized)
--             Crown: true to add a little gold crown (for royalty)

local Rarity = require(script.Parent.Rarity)

export type RGB = { number }

export type Visual = {
	Builder: string,
	Primary: RGB,
	Secondary: RGB?,
	Accent: RGB?,
	Scale: number?,
	Crown: boolean?,
	Transparency: number?,
}

export type Collectible = {
	Id: string,
	Name: string,
	Rarity: Rarity.RarityName,
	Price: number,
	Income: number,
	Blurb: string,
	Visual: Visual,
}

local ORANGE: RGB = { 232, 120, 36 }
local CREAM: RGB = { 245, 236, 214 }
local GREY: RGB = { 130, 130, 135 }
local DARK: RGB = { 40, 40, 45 }
local GREEN: RGB = { 70, 150, 70 }
local RED: RGB = { 200, 30, 30 }
local GOLD: RGB = { 255, 200, 40 }
local WHITE: RGB = { 240, 240, 240 }
local BLUE: RGB = { 40, 90, 200 }

local Collectibles = {}

Collectibles.List = ({
	-- ───────────── Common ─────────────
	{
		Id = "station_pigeon",
		Name = "Nunhead Station Pigeon",
		Rarity = "Common",
		Price = 25,
		Income = 1,
		Blurb = "Has been waiting for the 8:14 since 2009.",
		Visual = { Builder = "Bird", Primary = GREY, Secondary = { 90, 90, 110 }, Accent = ORANGE, Scale = 0.8 },
	},
	{
		Id = "cemetery_fox_cub",
		Name = "Cemetery Fox Cub",
		Rarity = "Common",
		Price = 40,
		Income = 1.5,
		Blurb = "Born behind a gravestone. Already knows your bin schedule.",
		Visual = { Builder = "Animal", Primary = ORANGE, Secondary = CREAM, Accent = DARK, Scale = 0.75 },
	},
	{
		Id = "parakeet",
		Name = "Ring-Necked Parakeet",
		Rarity = "Common",
		Price = 45,
		Income = 1.6,
		Blurb = "Loud, green and absolutely not from round here.",
		Visual = { Builder = "Bird", Primary = { 80, 200, 80 }, Secondary = { 60, 160, 60 }, Accent = RED, Scale = 0.8 },
	},
	{
		Id = "flat_white",
		Name = "Flat White",
		Rarity = "Common",
		Price = 30,
		Income = 1.1,
		Blurb = "£3.80. Oat milk extra.",
		Visual = { Builder = "Cup", Primary = WHITE, Secondary = { 120, 80, 50 }, Scale = 0.9 },
	},
	{
		Id = "traffic_cone",
		Name = "Evelina Road Cone",
		Rarity = "Common",
		Price = 20,
		Income = 0.8,
		Blurb = "Has guarded the same pothole for three years.",
		Visual = { Builder = "Cone", Primary = { 255, 120, 20 }, Secondary = WHITE, Scale = 0.9 },
	},
	{
		Id = "grey_squirrel",
		Name = "Grey Squirrel",
		Rarity = "Common",
		Price = 35,
		Income = 1.3,
		Blurb = "Runs the Peckham Rye nut economy.",
		Visual = { Builder = "Animal", Primary = GREY, Secondary = CREAM, Accent = DARK, Scale = 0.6 },
	},
	{
		Id = "wheelie_bin",
		Name = "Green Wheelie Bin",
		Rarity = "Common",
		Price = 50,
		Income = 2,
		Blurb = "Collection day is... nobody knows.",
		Visual = { Builder = "Crate", Primary = { 40, 110, 50 }, Secondary = DARK, Scale = 1 },
	},
	{
		Id = "carrier_bag",
		Name = "Blue Carrier Bag",
		Rarity = "Common",
		Price = 15,
		Income = 0.6,
		Blurb = "Bag for life. Currently stuck in a tree.",
		Visual = { Builder = "Blob", Primary = { 60, 120, 230 }, Scale = 0.6 },
	},

	-- ───────────── Uncommon ─────────────
	{
		Id = "pub_dog",
		Name = "Ivy House Pub Dog",
		Rarity = "Uncommon",
		Price = 150,
		Income = 5,
		Blurb = "Knows everyone. Judges everyone.",
		Visual = { Builder = "Animal", Primary = { 120, 85, 50 }, Secondary = CREAM, Accent = DARK, Scale = 0.95 },
	},
	{
		Id = "sourdough",
		Name = "Artisan Sourdough",
		Rarity = "Uncommon",
		Price = 110,
		Income = 4,
		Blurb = "72-hour ferment. 72-second queue.",
		Visual = { Builder = "Blob", Primary = { 200, 150, 90 }, Secondary = { 160, 110, 60 }, Scale = 0.8 },
	},
	{
		Id = "fixie_bike",
		Name = "Fixie Bike",
		Rarity = "Uncommon",
		Price = 180,
		Income = 6,
		Blurb = "No gears, no brakes, no fear.",
		Visual = { Builder = "Bike", Primary = { 30, 180, 190 }, Secondary = DARK, Scale = 1 },
	},
	{
		Id = "giant_marrow",
		Name = "Allotment Giant Marrow",
		Rarity = "Uncommon",
		Price = 130,
		Income = 4.5,
		Blurb = "Won the show. Terrified the judges.",
		Visual = { Builder = "Blob", Primary = { 90, 160, 60 }, Secondary = { 200, 220, 120 }, Scale = 1.2 },
	},
	{
		Id = "p12_bus_stop",
		Name = "P12 Bus Stop",
		Rarity = "Uncommon",
		Price = 200,
		Income = 7,
		Blurb = "Due in 2 minutes. Has been for 20.",
		Visual = { Builder = "Sign", Primary = RED, Secondary = WHITE, Accent = DARK, Scale = 1 },
	},
	{
		Id = "urban_fox",
		Name = "Urban Fox",
		Rarity = "Uncommon",
		Price = 220,
		Income = 8,
		Blurb = "Screams at 3am. Pays rent in chaos.",
		Visual = { Builder = "Animal", Primary = ORANGE, Secondary = CREAM, Accent = DARK, Scale = 1.05 },
	},
	{
		Id = "inside_out_brolly",
		Name = "Inside-Out Brolly",
		Rarity = "Uncommon",
		Price = 100,
		Income = 3.5,
		Blurb = "Lost the fight with Nunhead Lane.",
		Visual = { Builder = "Umbrella", Primary = { 40, 40, 120 }, Secondary = GREY, Scale = 1 },
	},

	-- ───────────── Rare ─────────────
	{
		Id = "cemetery_angel",
		Name = "Cemetery Angel",
		Rarity = "Rare",
		Price = 800,
		Income = 25,
		Blurb = "Victorian. Mossy. Watching you.",
		Visual = { Builder = "Statue", Primary = { 210, 210, 200 }, Secondary = { 120, 140, 110 }, Scale = 1.3 },
	},
	{
		Id = "red_phone_box",
		Name = "Red Phone Box",
		Rarity = "Rare",
		Price = 650,
		Income = 20,
		Blurb = "Now contains a defibrillator and a mystery smell.",
		Visual = { Builder = "Building", Primary = RED, Secondary = { 180, 220, 255 }, Accent = DARK, Scale = 0.8 },
	},
	{
		Id = "whippy_van",
		Name = "Mr Whippy Van",
		Rarity = "Rare",
		Price = 1000,
		Income = 32,
		Blurb = "Plays Greensleeves. Sells 99s for £4.50.",
		Visual = { Builder = "Vehicle", Primary = WHITE, Secondary = { 255, 150, 200 }, Accent = DARK, Scale = 1.1 },
	},
	{
		Id = "nunhead_train",
		Name = "Nunhead Station Train",
		Rarity = "Rare",
		Price = 1200,
		Income = 38,
		Blurb = "Terminates here due to a signalling fault at Lewisham.",
		Visual = { Builder = "Vehicle", Primary = { 30, 60, 140 }, Secondary = GOLD, Accent = DARK, Scale = 1.5 },
	},
	{
		Id = "street_piano",
		Name = "Street Piano",
		Rarity = "Rare",
		Price = 700,
		Income = 22,
		Blurb = "Someone is always playing the same four chords.",
		Visual = { Builder = "Piano", Primary = DARK, Secondary = WHITE, Scale = 1 },
	},
	{
		Id = "fox_king",
		Name = "Reggie the Fox King",
		Rarity = "Rare",
		Price = 1500,
		Income = 48,
		Blurb = "Rules every bin from Nunhead to Brockley.",
		Visual = { Builder = "Animal", Primary = ORANGE, Secondary = CREAM, Accent = DARK, Scale = 1.3, Crown = true },
	},

	-- ───────────── Epic ─────────────
	{
		Id = "chapel_ruins",
		Name = "Anglican Chapel Ruins",
		Rarity = "Epic",
		Price = 4000,
		Income = 120,
		Blurb = "Gothic, roofless, and extremely photogenic.",
		Visual = { Builder = "Building", Primary = { 150, 145, 135 }, Secondary = { 90, 110, 80 }, Accent = DARK, Scale = 1.6 },
	},
	{
		Id = "ivy_house",
		Name = "The Ivy House",
		Rarity = "Epic",
		Price = 5000,
		Income = 150,
		Blurb = "London's first community-owned pub. Quiz night is sacred.",
		Visual = { Builder = "Building", Primary = { 40, 100, 70 }, Secondary = CREAM, Accent = GOLD, Scale = 1.5 },
	},
	{
		Id = "bus_78",
		Name = "The 78 Bus",
		Rarity = "Epic",
		Price = 4500,
		Income = 135,
		Blurb = "Nunhead to Shoreditch. Top deck, front seat, no notes.",
		Visual = { Builder = "Vehicle", Primary = RED, Secondary = WHITE, Accent = DARK, Scale = 1.7 },
	},
	{
		Id = "reservoir_sunset",
		Name = "Reservoir Sunset",
		Rarity = "Epic",
		Price = 3500,
		Income = 105,
		Blurb = "The whole of London, going orange, for free.",
		Visual = { Builder = "Disk", Primary = { 255, 140, 60 }, Secondary = { 255, 200, 100 }, Accent = { 120, 60, 140 }, Scale = 1.4 },
	},
	{
		Id = "nuns_head_sign",
		Name = "Nun's Head Pub Sign",
		Rarity = "Epic",
		Price = 3800,
		Income = 115,
		Blurb = "The nun that named the whole neighbourhood.",
		Visual = { Builder = "Sign", Primary = DARK, Secondary = GOLD, Accent = CREAM, Scale = 1.3 },
	},

	-- ───────────── Legendary ─────────────
	{
		Id = "cemetery_gates",
		Name = "Nunhead Cemetery Gates",
		Rarity = "Legendary",
		Price = 20000,
		Income = 650,
		Blurb = "Fifty-two acres of the most haunted beauty in South London.",
		Visual = { Builder = "Gate", Primary = DARK, Secondary = { 150, 145, 135 }, Accent = GOLD, Scale = 1.8 },
	},
	{
		Id = "golden_parakeet",
		Name = "Golden Parakeet",
		Rarity = "Legendary",
		Price = 18000,
		Income = 600,
		Blurb = "One in a million. Still screams like the others.",
		Visual = { Builder = "Bird", Primary = GOLD, Secondary = { 230, 170, 20 }, Accent = RED, Scale = 1.1 },
	},
	{
		Id = "nunhead_green",
		Name = "Nunhead Green (The Whole Thing)",
		Rarity = "Legendary",
		Price = 25000,
		Income = 800,
		Blurb = "You have stolen a park. Well done, I suppose.",
		Visual = { Builder = "Disk", Primary = GREEN, Secondary = { 110, 70, 40 }, Accent = { 50, 120, 50 }, Scale = 1.8 },
	},
	{
		Id = "station_clock",
		Name = "Station Clock",
		Rarity = "Legendary",
		Price = 22000,
		Income = 700,
		Blurb = "Correct twice a day, which beats the trains.",
		Visual = { Builder = "Tower", Primary = { 150, 100, 70 }, Secondary = CREAM, Accent = DARK, Scale = 1.8 },
	},

	-- ───────────── Mythic ─────────────
	{
		Id = "reservoir_nessie",
		Name = "Nessie of Nunhead Reservoir",
		Rarity = "Mythic",
		Price = 120000,
		Income = 4500,
		Blurb = "Nobody has seen her. Nobody can prove she isn't there.",
		Visual = { Builder = "Animal", Primary = { 30, 140, 150 }, Secondary = { 120, 220, 210 }, Accent = DARK, Scale = 2.2 },
	},
	{
		Id = "ghost_nun",
		Name = "The Ghost Nun",
		Rarity = "Mythic",
		Price = 150000,
		Income = 5500,
		Blurb = "Floats down Nunhead Lane at midnight. Tuts at litter.",
		Visual = { Builder = "Statue", Primary = { 200, 220, 255 }, Secondary = { 140, 160, 220 }, Scale = 1.6, Transparency = 0.45 },
	},
	{
		Id = "mega_fox",
		Name = "MEGA FOX",
		Rarity = "Mythic",
		Price = 200000,
		Income = 7500,
		Blurb = "It ate the bins. It ate the bin lorry. It is still hungry.",
		Visual = { Builder = "Animal", Primary = ORANGE, Secondary = CREAM, Accent = DARK, Scale = 2.6, Crown = true },
	},
} :: { Collectible })

-- Fast lookups
Collectibles.ById = {} :: { [string]: Collectible }
Collectibles.ByRarity = {} :: { [string]: { Collectible } }

for _, item in Collectibles.List do
	assert(Collectibles.ById[item.Id] == nil, "Duplicate collectible id: " .. item.Id)
	Collectibles.ById[item.Id] = item
	local bucket = Collectibles.ByRarity[item.Rarity]
	if not bucket then
		bucket = {}
		Collectibles.ByRarity[item.Rarity] = bucket
	end
	table.insert(bucket, item)
end

function Collectibles.get(id: string): Collectible?
	return Collectibles.ById[id]
end

-- Pick a random item of a given rarity. `random` returns [0,1).
function Collectibles.randomOfRarity(rarity: string, random: () -> number): Collectible
	local bucket = Collectibles.ByRarity[rarity]
	assert(bucket and #bucket > 0, "No collectibles of rarity " .. tostring(rarity))
	local idx = math.floor(random() * #bucket) + 1
	return bucket[math.clamp(idx, 1, #bucket)]
end

-- Roll a rarity then an item.
function Collectibles.rollSpawn(random: () -> number, luck: number?): Collectible
	local rarity = Rarity.roll(random, luck)
	return Collectibles.randomOfRarity(rarity, random)
end

return Collectibles
