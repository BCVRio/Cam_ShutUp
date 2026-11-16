--!strict
-- Spawns collectibles at the west end of the Evelina Road belt and slides them east.
-- Players buy them off the belt with a ProximityPrompt.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Collectibles = require(Shared.Collectibles)
local Format = require(Shared.Format)
local Rarity = require(Shared.Rarity)
local Palette = require(Shared.Palette)
local Remotes = require(Shared.Remotes)

local EconomyService = require(script.Parent.EconomyService)
local CarryService = require(script.Parent.CarryService)
local CollectibleFactory = require(script.Parent.CollectibleFactory)
local MapBuilder = require(script.Parent.MapBuilder)

local ConveyorService = {}

type BeltItem = {
	Model: Model,
	ItemId: string,
	X: number,
	Sold: boolean,
}

local items: { BeltItem } = {}
local beltFolder: Folder
local belt: BasePart
local rng = Random.new()

local function random(): number
	return rng:NextNumber()
end

local function currentLuck(): number
	return math.max(0, (#Players:GetPlayers() - 1) * Config.Conveyor.LuckPerPlayer)
end

local function beltCFrameAt(x: number, height: number): CFrame
	local topY = belt.Position.Y + belt.Size.Y / 2
	-- face "down the belt" (east)
	return CFrame.new(Vector3.new(x, topY, belt.Position.Z)) * CFrame.Angles(0, math.rad(-90), 0)
end

local function spawnOne()
	local def = Collectibles.rollSpawn(random, currentLuck())
	local model = CollectibleFactory.build(def.Id)
	CollectibleFactory.setAnchored(model, true)
	CollectibleFactory.setSubtext(model, Format.cash(def.Price), Palette.rgb(Rarity.get(def.Rarity).ColorRGB))

	local startX = -Config.Conveyor.Length / 2 + 2
	model:PivotTo(beltCFrameAt(startX, 0))
	model.Parent = beltFolder

	local entry: BeltItem = { Model = model, ItemId = def.Id, X = startX, Sold = false }
	table.insert(items, entry)

	local prompt = Instance.new("ProximityPrompt")
	prompt.ActionText = "Buy " .. Format.cash(def.Price)
	prompt.ObjectText = def.Name .. "  •  " .. Format.income(def.Income)
	prompt.HoldDuration = 0
	prompt.MaxActivationDistance = 11
	prompt.RequiresLineOfSight = false
	prompt.Parent = model.PrimaryPart

	prompt.Triggered:Connect(function(player)
		if entry.Sold then
			return
		end
		if CarryService.isCarrying(player) then
			Remotes.get(Remotes.Names.Notify):FireClient(player, "You're already carrying something!", "bad")
			Remotes.get(Remotes.Names.PlaySound):FireClient(player, "Deny")
			return
		end
		if not EconomyService.trySpend(player, def.Price) then
			Remotes.get(Remotes.Names.Notify):FireClient(player, "Not enough cash! Need " .. Format.cash(def.Price), "bad")
			Remotes.get(Remotes.Names.PlaySound):FireClient(player, "Deny")
			return
		end
		entry.Sold = true
		prompt:Destroy()
		local idx = table.find(items, entry)
		if idx then
			table.remove(items, idx)
		end
		if not CarryService.startCarry(player, def.Id, model) then
			-- Couldn't attach (no character?) - refund
			EconomyService.addCash(player, def.Price)
			model:Destroy()
			return
		end
		Remotes.get(Remotes.Names.PlaySound):FireClient(player, "Pickup")
		Remotes.get(Remotes.Names.Notify):FireClient(player, "Bought " .. def.Name .. "! Take it to a pedestal.", "good")
	end)

	-- Announce the good stuff
	if Rarity.index(def.Rarity) >= Rarity.index("Epic") then
		Remotes.get(Remotes.Names.RareSpawn):FireAllClients(def.Name, def.Rarity)
		Remotes.get(Remotes.Names.PlaySound):FireAllClients("RareSpawn")
	end
end

function ConveyorService.start()
	belt = MapBuilder.getConveyorBelt()
	beltFolder = Instance.new("Folder")
	beltFolder.Name = "Belt"
	beltFolder.Parent = Workspace

	-- Mover
	local endX = Config.Conveyor.Length / 2 - 2
	RunService.Heartbeat:Connect(function(dt)
		for i = #items, 1, -1 do
			local entry = items[i]
			if entry.Sold or entry.Model.Parent == nil then
				table.remove(items, i)
				continue
			end
			entry.X += Config.Conveyor.Speed * dt
			if entry.X >= endX then
				entry.Model:Destroy()
				table.remove(items, i)
			else
				entry.Model:PivotTo(beltCFrameAt(entry.X, 0))
			end
		end
	end)

	-- Spawner
	task.spawn(function()
		-- A few items ready for the first player
		for _ = 1, 3 do
			spawnOne()
			task.wait(0.4)
		end
		while true do
			task.wait(Config.Conveyor.SpawnInterval)
			if #Players:GetPlayers() > 0 and #items < Config.Conveyor.MaxOnBelt then
				spawnOne()
			end
		end
	end)
end

return ConveyorService
