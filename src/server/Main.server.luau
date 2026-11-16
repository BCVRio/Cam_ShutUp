--!strict
-- Steal a Nunhead - server bootstrap.
-- Order matters: map -> plots -> economy -> carry -> conveyor -> lock -> bat -> data.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Remotes = require(Shared.Remotes)

local MapBuilder = require(script.Parent.MapBuilder)
local PlotService = require(script.Parent.PlotService)
local EconomyService = require(script.Parent.EconomyService)
local CarryService = require(script.Parent.CarryService)
local ConveyorService = require(script.Parent.ConveyorService)
local LockService = require(script.Parent.LockService)
local BatService = require(script.Parent.BatService)
local DataService = require(script.Parent.DataService)

print(string.format("[%s] v%s starting", Config.GameName, Config.Version))

Remotes.init()

local plotOrigins = MapBuilder.build()
PlotService.init(plotOrigins)
EconomyService.start()
CarryService.init()
ConveyorService.start()
LockService.init()
BatService.init()
DataService.init()

local function onPlayerAdded(player: Player)
	local plot = PlotService.assign(player)
	DataService.load(player)

	local function onCharacter(character: Model)
		-- Wait for the rig to exist, then put them outside their gaff.
		task.spawn(function()
			local root = character:WaitForChild("HumanoidRootPart", 10)
			if root and character.Parent and plot then
				task.wait() -- let the default SpawnLocation placement finish first
				PlotService.spawnAtPlot(player)
			end
		end)
	end
	player.CharacterAdded:Connect(onCharacter)
	if player.Character then
		onCharacter(player.Character)
	end

	Remotes.get(Remotes.Names.Notify):FireClient(
		player,
		"Welcome to Nunhead! Buy stuff off the belt, pop it on a pedestal, and guard it with your bat.",
		"info"
	)
end

Players.PlayerAdded:Connect(onPlayerAdded)
for _, p in Players:GetPlayers() do
	task.spawn(onPlayerAdded, p)
end

Players.PlayerRemoving:Connect(function(player)
	-- DataService saves on PlayerRemoving before this (connected earlier), then we free the plot.
	PlotService.release(player)
end)

print(string.format("[%s] ready: %d plots", Config.GameName, #plotOrigins))
