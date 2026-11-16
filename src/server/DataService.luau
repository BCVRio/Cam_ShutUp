--!strict
-- Saves cash and whatever is sitting on your pedestals.

local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Collectibles = require(Shared.Collectibles)

local PlotService = require(script.Parent.PlotService)
local EconomyService = require(script.Parent.EconomyService)
local CarryService = require(script.Parent.CarryService)

local DataService = {}

type Profile = {
	Version: number,
	Cash: number,
	LifetimeEarned: number,
	Slots: { [string]: string }, -- slotIndex (as string) -> itemId
}

local PROFILE_VERSION = 1

local store: DataStore? = nil
local loaded: { [Player]: boolean } = {}

local function getStore(): DataStore?
	if store then
		return store
	end
	local ok, result = pcall(function()
		return DataStoreService:GetDataStore(Config.DataStoreName)
	end)
	if ok then
		store = result
	else
		warn("[DataService] DataStore unavailable:", result)
	end
	return store
end

local function key(player: Player): string
	return "p_" .. player.UserId
end

local function snapshot(player: Player): Profile?
	local plot = PlotService.getPlotFor(player)
	local slots: { [string]: string } = {}
	if plot then
		for _, slot in plot.Slots do
			if slot.ItemId then
				slots[tostring(slot.Index)] = slot.ItemId
			end
		end
	end
	-- If they are carrying something when they leave, bank it onto a free pedestal in the save.
	local carried = CarryService.getCarried(player)
	if carried and plot then
		for i = 1, #plot.Slots do
			if not slots[tostring(i)] then
				slots[tostring(i)] = carried.ItemId
				break
			end
		end
	end
	return {
		Version = PROFILE_VERSION,
		Cash = math.floor(EconomyService.getCash(player)),
		LifetimeEarned = math.floor(EconomyService.getLifetimeEarned(player)),
		Slots = slots,
	}
end

function DataService.save(player: Player)
	if not loaded[player] then
		return -- never overwrite a profile we failed to load
	end
	local ds = getStore()
	if not ds then
		return
	end
	local profile = snapshot(player)
	if not profile then
		return
	end
	local ok, err = pcall(function()
		ds:SetAsync(key(player), profile)
	end)
	if not ok then
		warn("[DataService] save failed for", player.Name, err)
	end
end

function DataService.load(player: Player)
	local ds = getStore()
	local profile: Profile? = nil
	if ds then
		local ok, result = pcall(function()
			return ds:GetAsync(key(player))
		end)
		if player.Parent == nil then
			return -- left while we were waiting on the DataStore
		end
		if ok then
			profile = result
			loaded[player] = true
		else
			warn("[DataService] load failed for", player.Name, result)
			loaded[player] = false
		end
	else
		-- No DataStore (Studio without API access). Treat as a fresh profile but don't persist.
		loaded[player] = RunService:IsStudio()
	end

	EconomyService.setup(player)
	if profile and typeof(profile) == "table" then
		EconomyService.setCash(player, tonumber(profile.Cash) or Config.StartCash)
		EconomyService.setLifetimeEarned(player, tonumber(profile.LifetimeEarned) or 0)
		local plot = PlotService.getPlotFor(player)
		if plot and typeof(profile.Slots) == "table" then
			for idxStr, itemId in profile.Slots do
				local idx = tonumber(idxStr)
				if idx and typeof(itemId) == "string" and Collectibles.get(itemId) then
					CarryService.placeItem(plot, idx, itemId)
				end
			end
		end
	end
end

function DataService.init()
	-- One handler so the order is explicit: save (while the plot still has its items), then release.
	Players.PlayerRemoving:Connect(function(player)
		DataService.save(player)
		-- The carried item (if any) was banked into the save above; now get rid of the model.
		local _, model = CarryService.stopCarry(player)
		if model then
			model:Destroy()
		end
		loaded[player] = nil
		EconomyService.cleanup(player)
		PlotService.release(player)
	end)

	-- Autosave
	task.spawn(function()
		while true do
			task.wait(Config.AutosaveSeconds)
			for _, p in Players:GetPlayers() do
				DataService.save(p)
			end
		end
	end)

	game:BindToClose(function()
		if RunService:IsStudio() then
			return
		end
		for _, p in Players:GetPlayers() do
			DataService.save(p)
		end
	end)
end

return DataService
