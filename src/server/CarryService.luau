--!strict
-- Picking up, carrying, placing, stealing, dropping and selling collectibles.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")
local Debris = game:GetService("Debris")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Collectibles = require(Shared.Collectibles)
local Format = require(Shared.Format)
local Rarity = require(Shared.Rarity)
local Palette = require(Shared.Palette)
local Remotes = require(Shared.Remotes)

local PlotService = require(script.Parent.PlotService)
local EconomyService = require(script.Parent.EconomyService)
local CollectibleFactory = require(script.Parent.CollectibleFactory)

local CarryService = {}

type Carry = {
	ItemId: string,
	Model: Model,
	Weld: WeldConstraint?,
}

local carrying: { [Player]: Carry } = {}
local holdStarted: { [Player]: { [ProximityPrompt]: number } } = {}
-- After an owner lifts an item off a pedestal they are still touching it; block re-placing for a moment.
local placeBlockedUntil: { [PlotService.Slot]: number } = {}

local droppedFolder: Folder

local function notify(player: Player, msg: string, kind: string)
	Remotes.get(Remotes.Names.Notify):FireClient(player, msg, kind)
end

local function sound(player: Player, key: string)
	Remotes.get(Remotes.Names.PlaySound):FireClient(player, key)
end

local function fireCarryChanged(player: Player)
	local c = carrying[player]
	if c then
		local item = Collectibles.get(c.ItemId)
		Remotes.get(Remotes.Names.CarryChanged):FireClient(player, item and item.Name or c.ItemId, item and item.Rarity or "Common")
	else
		Remotes.get(Remotes.Names.CarryChanged):FireClient(player, nil, nil)
	end
end

local function setWalkSpeed(player: Player)
	local character = player.Character
	local hum = character and character:FindFirstChildOfClass("Humanoid")
	if hum then
		local base = (game:GetService("StarterPlayer") :: StarterPlayer).CharacterWalkSpeed
		hum.WalkSpeed = carrying[player] and base * Config.CarryWalkSpeedMultiplier or base
	end
end

-- ───────────────────────── carrying ─────────────────────────

function CarryService.isCarrying(player: Player): boolean
	return carrying[player] ~= nil
end

function CarryService.getCarried(player: Player): Carry?
	return carrying[player]
end

-- Attach a model above the player's head. Takes ownership of `model`.
function CarryService.startCarry(player: Player, itemId: string, model: Model?): boolean
	if carrying[player] then
		return false
	end
	local character = player.Character
	local head = character and character:FindFirstChild("Head")
	if not character or not head or not head:IsA("BasePart") then
		return false
	end

	model = model or CollectibleFactory.build(itemId)
	local m = model :: Model
	local root = m.PrimaryPart :: BasePart

	-- Remove any prompt left over from the belt / a drop
	for _, p in root:GetChildren() do
		if p:IsA("ProximityPrompt") then
			p:Destroy()
		end
	end

	CollectibleFactory.setLabelVisible(m, false)
	CollectibleFactory.setCollidable(m, false)
	CollectibleFactory.setAnchored(m, false)

	local def = Collectibles.get(itemId)
	local scale = (def and def.Visual.Scale) or 1
	local lift = 1.2 + 0.4 * scale
	m:PivotTo(head.CFrame * CFrame.new(0, lift, 0))

	local weld = Instance.new("WeldConstraint")
	weld.Part0 = head
	weld.Part1 = root
	weld.Parent = root

	m.Parent = character
	carrying[player] = { ItemId = itemId, Model = m, Weld = weld }
	setWalkSpeed(player)
	fireCarryChanged(player)
	return true
end

-- Detach and return the model (unparented). Caller decides what to do with it.
function CarryService.stopCarry(player: Player): (string?, Model?)
	local c = carrying[player]
	if not c then
		return nil, nil
	end
	carrying[player] = nil
	if c.Weld then
		c.Weld:Destroy()
	end
	c.Model.Parent = nil
	setWalkSpeed(player)
	fireCarryChanged(player)
	return c.ItemId, c.Model
end

-- ───────────────────────── pedestals ─────────────────────────

local function placeInSlot(plot: PlotService.Plot, slot: PlotService.Slot, itemId: string, model: Model)
	slot.ItemId = itemId
	slot.Model = model
	slot.Stored = 0
	CollectibleFactory.setAnchored(model, true)
	CollectibleFactory.setCollidable(model, false)
	CollectibleFactory.setLabelVisible(model, true)
	local item = Collectibles.get(itemId)
	if item then
		CollectibleFactory.setSubtext(model, Rarity.get(item.Rarity).Label, Palette.rgb(Rarity.get(item.Rarity).ColorRGB))
	end
	local top = slot.Pedestal.CFrame * CFrame.new(0, slot.Pedestal.Size.Y / 2 + 0.3, 0)
	-- Face the road
	local facing = CFrame.lookAt(top.Position, top.Position + plot.Base.LookVector)
	model:PivotTo(facing)
	model.Parent = plot.Model
	slot.Prompt.Enabled = true
	slot.Prompt.ObjectText = item and item.Name or itemId
	EconomyService.refreshSlot(slot)
end

local function clearSlot(slot: PlotService.Slot): (string?, Model?)
	local itemId, model = slot.ItemId, slot.Model
	slot.ItemId = nil
	slot.Model = nil
	slot.Stored = 0
	slot.Prompt.Enabled = false
	slot.Prompt.ObjectText = ""
	if model then
		model.Parent = nil
	end
	EconomyService.refreshSlot(slot)
	return itemId, model
end

-- Public: used by DataService to restore saves.
function CarryService.placeItem(plot: PlotService.Plot, slotIndex: number, itemId: string): boolean
	local slot = plot.Slots[slotIndex]
	if not slot or slot.ItemId or not Collectibles.get(itemId) then
		return false
	end
	placeInSlot(plot, slot, itemId, CollectibleFactory.build(itemId))
	return true
end

function CarryService.firstFreeSlot(plot: PlotService.Plot): PlotService.Slot?
	for _, slot in plot.Slots do
		if not slot.ItemId then
			return slot
		end
	end
	return nil
end

local function tryPlace(player: Player, plot: PlotService.Plot, slot: PlotService.Slot)
	if plot.Owner ~= player or slot.ItemId then
		return
	end
	if (placeBlockedUntil[slot] or 0) > os.clock() then
		return
	end
	local c = carrying[player]
	if not c then
		return
	end
	local itemId, model = CarryService.stopCarry(player)
	if itemId and model then
		placeInSlot(plot, slot, itemId, model)
		sound(player, "Place")
		local item = Collectibles.get(itemId)
		notify(player, (item and item.Name or itemId) .. " placed. Earning " .. Format.income(item and item.Income or 0), "good")
	end
end

local function trySteal(thief: Player, plot: PlotService.Plot, slot: PlotService.Slot)
	if not slot.ItemId or not slot.Model then
		return
	end
	if carrying[thief] then
		notify(thief, "You're already carrying something!", "bad")
		sound(thief, "Deny")
		return
	end
	if PlotService.isLocked(plot) then
		notify(thief, "That base is locked!", "bad")
		sound(thief, "Deny")
		return
	end
	local owner = plot.Owner
	local itemId, model = clearSlot(slot)
	if not itemId or not model then
		return
	end
	if not CarryService.startCarry(thief, itemId, model) then
		placeInSlot(plot, slot, itemId, model)
		return
	end
	local item = Collectibles.get(itemId)
	local name = item and item.Name or itemId
	sound(thief, "Pickup")
	notify(thief, "You nicked " .. name .. "! Leg it back to your base.", "steal")
	if owner then
		sound(owner, "StealAlarm")
		notify(owner, thief.DisplayName .. " is nicking your " .. name .. "!", "steal")
	end
end

local function tryOwnerPickup(player: Player, plot: PlotService.Plot, slot: PlotService.Slot)
	if carrying[player] then
		notify(player, "You're already carrying something!", "bad")
		sound(player, "Deny")
		return
	end
	local itemId, model = clearSlot(slot)
	if itemId and model then
		if CarryService.startCarry(player, itemId, model) then
			placeBlockedUntil[slot] = os.clock() + 1.5
			sound(player, "Pickup")
		else
			placeInSlot(plot, slot, itemId, model)
		end
	end
end

-- ───────────────────────── drops ─────────────────────────

function CarryService.dropCarried(player: Player, position: Vector3?)
	local c = carrying[player]
	if not c then
		return
	end
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	local pos = position or (root and root:IsA("BasePart") and root.Position) or Vector3.new(0, 5, 0)
	local itemId, model = CarryService.stopCarry(player)
	if not itemId or not model then
		return
	end
	-- Put it on the ground nearby
	local rayParams = RaycastParams.new()
	rayParams.FilterType = Enum.RaycastFilterType.Exclude
	rayParams.FilterDescendantsInstances = { character :: Instance, model }
	local hit = Workspace:Raycast(pos + Vector3.new(0, 2, 0), Vector3.new(0, -40, 0), rayParams)
	local groundY = hit and hit.Position.Y or (pos.Y - 3)
	local offset = Vector3.new(math.random(-3, 3), 0, math.random(-3, 3))
	CollectibleFactory.setAnchored(model, true)
	CollectibleFactory.setCollidable(model, false)
	CollectibleFactory.setLabelVisible(model, true)
	local item = Collectibles.get(itemId)
	CollectibleFactory.setSubtext(model, "DROPPED - pick up!", Color3.fromRGB(255, 230, 120))
	model:PivotTo(CFrame.new(Vector3.new(pos.X, groundY, pos.Z) + offset))
	model.Parent = droppedFolder

	local prompt = Instance.new("ProximityPrompt")
	prompt.ActionText = "Pick up"
	prompt.ObjectText = item and item.Name or itemId
	prompt.HoldDuration = 0.4
	prompt.MaxActivationDistance = 10
	prompt.RequiresLineOfSight = false
	prompt.Parent = model.PrimaryPart
	prompt.Triggered:Connect(function(picker)
		if model.Parent ~= droppedFolder then
			return
		end
		if carrying[picker] then
			notify(picker, "You're already carrying something!", "bad")
			sound(picker, "Deny")
			return
		end
		prompt:Destroy()
		CarryService.startCarry(picker, itemId, model)
		sound(picker, "Pickup")
	end)
	Debris:AddItem(model, Config.DroppedItemLifetime)
	notify(player, "You dropped your " .. (item and item.Name or itemId) .. "!", "bad")
end

-- ───────────────────────── sell ─────────────────────────

local function trySell(player: Player, slotIndex: number)
	local plot = PlotService.getPlotFor(player)
	if not plot or typeof(slotIndex) ~= "number" then
		return
	end
	local slot = plot.Slots[slotIndex]
	if not slot or not slot.ItemId then
		return
	end
	local item = Collectibles.get(slot.ItemId)
	local stored = math.floor(slot.Stored)
	local itemId, model = clearSlot(slot)
	if model then
		model:Destroy()
	end
	local refund = math.floor((item and item.Price or 0) * Config.SellRefundFraction) + stored
	EconomyService.addCash(player, refund, true)
	sound(player, "Collect")
	notify(player, "Sold " .. (item and item.Name or tostring(itemId)) .. " for " .. Format.cash(refund), "good")
end

-- ───────────────────────── wiring ─────────────────────────

function CarryService.init()
	droppedFolder = Instance.new("Folder")
	droppedFolder.Name = "Dropped"
	droppedFolder.Parent = Workspace

	for _, plot in PlotService.getPlots() do
		for _, slot in plot.Slots do
			-- Place by walking into an empty pedestal while carrying
			slot.Pedestal.Touched:Connect(function(hit)
				local character = hit:FindFirstAncestorOfClass("Model")
				local player = character and Players:GetPlayerFromCharacter(character)
				if player and carrying[player] and plot.Owner == player and not slot.ItemId then
					tryPlace(player, plot, slot)
				end
			end)

			-- Hold-time bookkeeping (anti-cheat for stealing)
			slot.Prompt.PromptButtonHoldBegan:Connect(function(player)
				holdStarted[player] = holdStarted[player] or {}
				holdStarted[player][slot.Prompt] = os.clock()
			end)

			slot.Prompt.Triggered:Connect(function(player)
				if not slot.ItemId then
					return
				end
				if plot.Owner == player then
					tryOwnerPickup(player, plot, slot)
					return
				end
				-- Non-owner: verify they actually held for roughly the steal duration.
				local began = holdStarted[player] and holdStarted[player][slot.Prompt]
				if not began or (os.clock() - began) < (Config.StealHoldSeconds - 0.35) then
					notify(player, "Hold it longer to steal!", "bad")
					return
				end
				trySteal(player, plot, slot)
			end)
		end
	end

	Remotes.get(Remotes.Names.RequestSell).OnServerEvent:Connect(trySell)

	Players.PlayerAdded:Connect(function(player)
		player.CharacterAdded:Connect(function(character)
			local hum = character:WaitForChild("Humanoid", 5)
			if hum and hum:IsA("Humanoid") then
				hum.Died:Connect(function()
					CarryService.dropCarried(player)
				end)
			end
		end)
	end)

	-- NOTE: a carried item is banked into the save by DataService on leave, then destroyed there.
	Players.PlayerRemoving:Connect(function(player)
		holdStarted[player] = nil
	end)
end

return CarryService
