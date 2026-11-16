--!strict
-- Central tuning for Steal a Nunhead.
-- Everything here is plain data (no Roblox types) so it can be loaded in tests.

local Config = {
	GameName = "Steal a Nunhead",
	Version = "0.1.0",

	-- Economy
	StartCash = 50,
	IncomeTickSeconds = 1,
	SellRefundFraction = 0.5,

	-- Plots / bases
	PlotCount = 8,
	SlotRows = 2,
	SlotCols = 5, -- SlotRows * SlotCols = slots per base
	SlotSpacing = 7,

	-- Conveyor ("Evelina Road")
	Conveyor = {
		Length = 150,
		Speed = 7, -- studs / second
		SpawnInterval = 2.4, -- seconds between spawns
		MaxOnBelt = 14,
		-- Luck: chance multipliers applied to rarity weights as the server fills up,
		-- so a busy server sees more rare spawns (keeps things exciting).
		LuckPerPlayer = 0.06,
	},

	-- Carrying / stealing
	StealHoldSeconds = 1.6, -- hold time on someone else's pedestal
	OwnerPickupHoldSeconds = 0.25,
	CarryWalkSpeedMultiplier = 0.85,
	DroppedItemLifetime = 45, -- seconds before a dropped item is cleaned up

	-- Base lock (shield)
	BaseLock = {
		Duration = 45,
		Cooldown = 90,
	},

	-- Cricket bat
	Bat = {
		Range = 9,
		Cooldown = 1.0,
		StunSeconds = 1.6,
		KnockbackForce = 55,
	},

	-- Persistence
	DataStoreName = "StealANunhead_v1",
	AutosaveSeconds = 120,

	-- Map layout (studs)
	Map = {
		GroundSize = 560,
		GreenRadius = 70, -- Nunhead Green in the middle
		PlotSize = 48,
		PlotDepth = 40,
		PlotRowOffset = 125, -- distance of plot rows from centre (both sides)
		PlotGap = 10,
		RoadWidth = 16,
	},
}

Config.SlotsPerPlot = Config.SlotRows * Config.SlotCols

return Config
