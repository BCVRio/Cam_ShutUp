--!strict
-- Cash, leaderstats and pedestal income.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Collectibles = require(Shared.Collectibles)
local Format = require(Shared.Format)
local Rarity = require(Shared.Rarity)
local Palette = require(Shared.Palette)
local Remotes = require(Shared.Remotes)

local PlotService = require(script.Parent.PlotService)

local EconomyService = {}

local cash: { [Player]: number } = {}
local lifetimeEarned: { [Player]: number } = {}

local function ensureLeaderstats(player: Player): IntValue
	local ls = player:FindFirstChild("leaderstats")
	if not ls then
		ls = Instance.new("Folder")
		ls.Name = "leaderstats"
		ls.Parent = player
	end
	local cashValue = ls:FindFirstChild("Cash")
	if not cashValue then
		cashValue = Instance.new("IntValue")
		cashValue.Name = "Cash"
		cashValue.Parent = ls
	end
	return cashValue :: IntValue
end

local function push(player: Player)
	local v = ensureLeaderstats(player)
	v.Value = math.floor(cash[player] or 0)
	player:SetAttribute("Cash", cash[player] or 0)
	player:SetAttribute("LifetimeEarned", lifetimeEarned[player] or 0)
end

function EconomyService.setup(player: Player)
	cash[player] = cash[player] or Config.StartCash
	lifetimeEarned[player] = lifetimeEarned[player] or 0
	push(player)
end

function EconomyService.setCash(player: Player, amount: number)
	cash[player] = math.max(0, amount)
	push(player)
end

function EconomyService.getCash(player: Player): number
	return cash[player] or 0
end

function EconomyService.getLifetimeEarned(player: Player): number
	return lifetimeEarned[player] or 0
end

function EconomyService.setLifetimeEarned(player: Player, amount: number)
	lifetimeEarned[player] = amount
	push(player)
end

function EconomyService.addCash(player: Player, amount: number, countsAsEarned: boolean?)
	cash[player] = (cash[player] or 0) + amount
	if countsAsEarned then
		lifetimeEarned[player] = (lifetimeEarned[player] or 0) + amount
	end
	push(player)
end

function EconomyService.trySpend(player: Player, amount: number): boolean
	local have = cash[player] or 0
	if have < amount then
		return false
	end
	cash[player] = have - amount
	push(player)
	return true
end

function EconomyService.cleanup(player: Player)
	cash[player] = nil
	lifetimeEarned[player] = nil
end

-- Total income/sec of a plot (for the HUD)
function EconomyService.plotIncome(plot: PlotService.Plot): number
	local total = 0
	for _, slot in plot.Slots do
		if slot.ItemId then
			local item = Collectibles.get(slot.ItemId)
			if item then
				total += item.Income
			end
		end
	end
	return total
end

function EconomyService.collect(player: Player): number
	local plot = PlotService.getPlotFor(player)
	if not plot then
		return 0
	end
	local total = 0
	for _, slot in plot.Slots do
		if slot.Stored > 0 then
			total += slot.Stored
			slot.Stored = 0
		end
	end
	if total >= 1 then
		total = math.floor(total)
		EconomyService.addCash(player, total, true)
		Remotes.get(Remotes.Names.PlaySound):FireClient(player, "Collect")
		Remotes.get(Remotes.Names.Notify):FireClient(player, "Collected " .. Format.cash(total), "good")
	end
	return total
end

local function slotLabel(slot: PlotService.Slot): string
	if not slot.ItemId then
		return "EMPTY"
	end
	local item = Collectibles.get(slot.ItemId)
	if not item then
		return "?"
	end
	return Format.income(item.Income) .. "   " .. Format.cash(slot.Stored)
end

function EconomyService.start()
	-- Collect pads
	for _, plot in PlotService.getPlots() do
		plot.CollectPad.Touched:Connect(function(hit)
			local character = hit:FindFirstAncestorOfClass("Model")
			local player = character and Players:GetPlayerFromCharacter(character)
			if player and plot.Owner == player then
				EconomyService.collect(player)
			end
		end)
	end

	-- Income tick
	local acc = 0
	local guiAcc = 0
	RunService.Heartbeat:Connect(function(dt)
		acc += dt
		guiAcc += dt
		if acc < Config.IncomeTickSeconds then
			return
		end
		local step = acc
		acc = 0
		local refreshGui = guiAcc >= 0.5
		if refreshGui then
			guiAcc = 0
		end
		for _, plot in PlotService.getPlots() do
			if plot.Owner then
				local plotTotal = 0
				for _, slot in plot.Slots do
					if slot.ItemId then
						local item = Collectibles.get(slot.ItemId)
						if item then
							slot.Stored += item.Income * step
							plotTotal += item.Income
							if refreshGui then
								PlotService.refreshSlotGui(slot, slotLabel(slot))
							end
						end
					end
				end
				plot.Model:SetAttribute("Income", plotTotal)
			end
		end
	end)
end

-- Called by CarryService when an item lands on / leaves a pedestal so the label is right immediately.
function EconomyService.refreshSlot(slot: PlotService.Slot)
	PlotService.refreshSlotGui(slot, slotLabel(slot))
	local label = slot.Gui:FindFirstChild("Text")
	if label and label:IsA("TextLabel") then
		if slot.ItemId then
			local item = Collectibles.get(slot.ItemId)
			label.TextColor3 = item and Palette.rgb(Rarity.get(item.Rarity).ColorRGB) or Color3.new(1, 1, 1)
		else
			label.TextColor3 = Color3.fromRGB(220, 220, 220)
		end
	end
end

return EconomyService
