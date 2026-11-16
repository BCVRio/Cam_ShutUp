--!strict
-- Builds the player bases ("plots") and assigns them to players.
--
-- A plot has:
--   Floor / low walls / a front doorway facing Evelina Road
--   Door      - ForceField part; CanCollide only while the base is locked
--   Slots     - pedestals where collectibles sit and earn
--   CollectPad- step on it to bank everything your pedestals have stored
--   LockPanel - ProximityPrompt to raise the shield
--   Sign      - owner's name over the door

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Remotes = require(Shared.Remotes)

local PlotService = {}

export type Slot = {
	Index: number,
	Pedestal: BasePart,
	Prompt: ProximityPrompt,
	Gui: BillboardGui,
	ItemId: string?,
	Model: Model?,
	Stored: number,
}

export type Plot = {
	Index: number,
	Model: Model,
	Origin: Vector3,
	Base: CFrame, -- local frame: +Z points at the road (front)
	Owner: Player?,
	Slots: { Slot },
	Door: BasePart,
	CollectPad: BasePart,
	LockPanel: BasePart,
	LockPrompt: ProximityPrompt,
	SignLabel: TextLabel,
	SpawnCFrame: CFrame,
	LockedUntil: number,
	CooldownUntil: number,
}

local plots: { Plot } = {}
local plotByPlayer: { [Player]: Plot } = {}

local assignedCallbacks: { (Player, Plot) -> () } = {}
local releasedCallbacks: { (Player, Plot) -> () } = {}

local M = Config.Map

local COL = {
	Floor = Color3.fromRGB(190, 180, 165),
	Wall = Color3.fromRGB(150, 95, 70),
	WallTop = Color3.fromRGB(200, 196, 188),
	Pedestal = Color3.fromRGB(120, 118, 112),
	PedestalTop = Color3.fromRGB(230, 225, 210),
	Door = Color3.fromRGB(90, 200, 255),
	Pad = Color3.fromRGB(60, 190, 90),
	Panel = Color3.fromRGB(40, 40, 45),
	Sign = Color3.fromRGB(40, 100, 70),
}

local function part(name: string, size: Vector3, cframe: CFrame, color: Color3, material: Enum.Material?, parent: Instance): Part
	local p = Instance.new("Part")
	p.Name = name
	p.Size = size
	p.CFrame = cframe
	p.Color = color
	p.Material = material or Enum.Material.SmoothPlastic
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Parent = parent
	return p
end

local function buildPlot(index: number, origin: Vector3): Plot
	local model = Instance.new("Model")
	model.Name = "Plot_" .. index
	model:SetAttribute("PlotIndex", index)
	model:SetAttribute("OwnerUserId", 0)

	local facing = origin.Z > 0 and math.pi or 0
	local base = CFrame.new(origin) * CFrame.Angles(0, facing, 0)

	local W, D = M.PlotSize, M.PlotDepth

	-- Floor
	part("Floor", Vector3.new(W, 1, D), base * CFrame.new(0, 0.5, 0), COL.Floor, Enum.Material.Cobblestone, model)

	-- Walls (back, left, right) + front wall with doorway
	local wallH = 5
	part("WallBack", Vector3.new(W, wallH, 1.5), base * CFrame.new(0, wallH / 2 + 1, -D / 2), COL.Wall, Enum.Material.Brick, model)
	part("WallLeft", Vector3.new(1.5, wallH, D), base * CFrame.new(-W / 2, wallH / 2 + 1, 0), COL.Wall, Enum.Material.Brick, model)
	part("WallRight", Vector3.new(1.5, wallH, D), base * CFrame.new(W / 2, wallH / 2 + 1, 0), COL.Wall, Enum.Material.Brick, model)
	local doorW = 10
	local sideW = (W - doorW) / 2
	part("WallFrontL", Vector3.new(sideW, wallH, 1.5), base * CFrame.new(-(doorW / 2 + sideW / 2), wallH / 2 + 1, D / 2), COL.Wall, Enum.Material.Brick, model)
	part("WallFrontR", Vector3.new(sideW, wallH, 1.5), base * CFrame.new(doorW / 2 + sideW / 2, wallH / 2 + 1, D / 2), COL.Wall, Enum.Material.Brick, model)
	for _, name in { "WallBack", "WallLeft", "WallRight", "WallFrontL", "WallFrontR" } do
		local w = model:FindFirstChild(name) :: BasePart
		part(name .. "Top", w.Size + Vector3.new(0.6, -wallH + 0.6, 0.6), w.CFrame * CFrame.new(0, wallH / 2 + 0.3, 0), COL.WallTop, Enum.Material.Concrete, model)
	end
	-- Door frame + lintel
	part("Lintel", Vector3.new(doorW + 2, 1.5, 2), base * CFrame.new(0, wallH + 1.5, D / 2), COL.WallTop, Enum.Material.Concrete, model)

	-- The door (shield). Unlocked = invisible & passable.
	local door = part("Door", Vector3.new(doorW, wallH + 1, 1), base * CFrame.new(0, (wallH + 1) / 2 + 1, D / 2), COL.Door, Enum.Material.ForceField, model)
	door.CanCollide = false
	door.Transparency = 1
	door.CanQuery = false

	-- Sign over the door
	local sign = part("Sign", Vector3.new(doorW + 6, 3, 0.6), base * CFrame.new(0, wallH + 4, D / 2 + 0.6), COL.Sign, Enum.Material.SmoothPlastic, model)
	local gui = Instance.new("SurfaceGui")
	gui.Face = Enum.NormalId.Front
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 40
	gui.Parent = sign
	local signLabel = Instance.new("TextLabel")
	signLabel.Size = UDim2.fromScale(1, 1)
	signLabel.BackgroundTransparency = 1
	signLabel.Text = "FOR SALE"
	signLabel.TextColor3 = Color3.new(1, 1, 1)
	signLabel.TextScaled = true
	signLabel.Font = Enum.Font.FredokaOne
	signLabel.Parent = gui

	-- Collect pad just inside the door
	local pad = part("CollectPad", Vector3.new(8, 0.4, 5), base * CFrame.new(0, 1.2, D / 2 - 5), COL.Pad, Enum.Material.Neon, model)
	pad.Name = "CollectPad"
	local padGui = Instance.new("SurfaceGui")
	padGui.Face = Enum.NormalId.Top
	padGui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	padGui.PixelsPerStud = 30
	padGui.Parent = pad
	local padLabel = Instance.new("TextLabel")
	padLabel.Size = UDim2.fromScale(1, 1)
	padLabel.BackgroundTransparency = 1
	padLabel.Text = "COLLECT £"
	padLabel.TextColor3 = Color3.new(1, 1, 1)
	padLabel.TextScaled = true
	padLabel.Font = Enum.Font.FredokaOne
	padLabel.Rotation = facing == 0 and 180 or 0
	padLabel.Parent = padGui

	-- Lock panel beside the door (inside)
	local panel = part("LockPanel", Vector3.new(2, 3, 0.8), base * CFrame.new(doorW / 2 + 3, 3.5, D / 2 - 1.6), COL.Panel, Enum.Material.Metal, model)
	local panelLight = part("LockLight", Vector3.new(1.4, 1.4, 0.3), base * CFrame.new(doorW / 2 + 3, 4.2, D / 2 - 2.1), Color3.fromRGB(80, 220, 120), Enum.Material.Neon, model)
	panelLight.Name = "LockLight"
	local lockPrompt = Instance.new("ProximityPrompt")
	lockPrompt.ActionText = "Lock Base"
	lockPrompt.ObjectText = string.format("Shield for %ds", Config.BaseLock.Duration)
	lockPrompt.HoldDuration = 0.3
	lockPrompt.MaxActivationDistance = 8
	lockPrompt.RequiresLineOfSight = false
	lockPrompt.Parent = panel

	-- Pedestals
	local slots: { Slot } = {}
	local rows, cols = Config.SlotRows, Config.SlotCols
	local spacing = Config.SlotSpacing
	local gridW = (cols - 1) * spacing
	local startZ = -D / 2 + 7
	local idx = 0
	for r = 1, rows do
		for c = 1, cols do
			idx += 1
			local lx = -gridW / 2 + (c - 1) * spacing
			local lz = startZ + (r - 1) * (spacing + 2)
			local ped = part("Pedestal_" .. idx, Vector3.new(4, 1.2, 4), base * CFrame.new(lx, 1.6, lz), COL.Pedestal, Enum.Material.Slate, model)
			ped:SetAttribute("SlotIndex", idx)
			local top = part("PedestalTop_" .. idx, Vector3.new(4.4, 0.3, 4.4), base * CFrame.new(lx, 2.35, lz), COL.PedestalTop, Enum.Material.Marble, model)
			top.CanCollide = false
			top.CanTouch = false
			top.CanQuery = false

			local prompt = Instance.new("ProximityPrompt")
			prompt.ActionText = "Steal"
			prompt.ObjectText = ""
			prompt.HoldDuration = Config.StealHoldSeconds
			prompt.MaxActivationDistance = 9
			prompt.RequiresLineOfSight = false
			prompt.Enabled = false
			prompt.Parent = ped

			local bb = Instance.new("BillboardGui")
			bb.Name = "SlotGui"
			bb.Size = UDim2.fromOffset(160, 40)
			bb.StudsOffsetWorldSpace = Vector3.new(0, 1.4, 0)
			bb.MaxDistance = 60
			bb.LightInfluence = 0
			bb.Parent = ped
			local bl = Instance.new("TextLabel")
			bl.Name = "Text"
			bl.Size = UDim2.fromScale(1, 1)
			bl.BackgroundTransparency = 1
			bl.Text = "EMPTY"
			bl.TextColor3 = Color3.fromRGB(220, 220, 220)
			bl.TextStrokeTransparency = 0.3
			bl.TextScaled = true
			bl.Font = Enum.Font.FredokaOne
			bl.Parent = bb

			table.insert(slots, {
				Index = idx,
				Pedestal = ped,
				Prompt = prompt,
				Gui = bb,
				ItemId = nil,
				Model = nil,
				Stored = 0,
			})
		end
	end

	model.Parent = Workspace:FindFirstChild("Plots") or (function()
		local f = Instance.new("Folder")
		f.Name = "Plots"
		f.Parent = Workspace
		return f
	end)()

	return {
		Index = index,
		Model = model,
		Origin = origin,
		Base = base,
		Owner = nil,
		Slots = slots,
		Door = door,
		CollectPad = pad,
		LockPanel = panel,
		LockPrompt = lockPrompt,
		SignLabel = signLabel,
		SpawnCFrame = base * CFrame.new(0, 4, D / 2 + 8) * CFrame.Angles(0, math.pi, 0),
		LockedUntil = 0,
		CooldownUntil = 0,
	}
end

-- ─────────────────────────── public ───────────────────────────

function PlotService.init(origins: { Vector3 })
	for i, origin in origins do
		plots[i] = buildPlot(i, origin)
	end
end

function PlotService.getPlots(): { Plot }
	return plots
end

function PlotService.getPlot(index: number): Plot?
	return plots[index]
end

function PlotService.getPlotFor(player: Player): Plot?
	return plotByPlayer[player]
end

function PlotService.isLocked(plot: Plot): boolean
	return os.clock() < plot.LockedUntil
end

function PlotService.onAssigned(cb: (Player, Plot) -> ())
	table.insert(assignedCallbacks, cb)
end

function PlotService.onReleased(cb: (Player, Plot) -> ())
	table.insert(releasedCallbacks, cb)
end

function PlotService.assign(player: Player): Plot?
	if plotByPlayer[player] then
		return plotByPlayer[player]
	end
	for _, plot in plots do
		if plot.Owner == nil then
			plot.Owner = player
			plotByPlayer[player] = plot
			plot.Model:SetAttribute("OwnerUserId", player.UserId)
			plot.SignLabel.Text = string.upper(player.DisplayName) .. "'S GAFF"
			Remotes.get(Remotes.Names.PlotAssigned):FireClient(player, plot.Model, plot.Index)
			for _, cb in assignedCallbacks do
				task.spawn(cb, player, plot)
			end
			return plot
		end
	end
	warn("No free plot for", player.Name)
	return nil
end

function PlotService.release(player: Player)
	local plot = plotByPlayer[player]
	if not plot then
		return
	end
	for _, cb in releasedCallbacks do
		cb(player, plot)
	end
	plotByPlayer[player] = nil
	plot.Owner = nil
	plot.Model:SetAttribute("OwnerUserId", 0)
	plot.SignLabel.Text = "FOR SALE"
	plot.LockedUntil = 0
	plot.CooldownUntil = 0
	plot.Door.CanCollide = false
	plot.Door.Transparency = 1
	-- Clear whatever is on the pedestals (saved by DataService before release)
	for _, slot in plot.Slots do
		if slot.Model then
			slot.Model:Destroy()
		end
		slot.Model = nil
		slot.ItemId = nil
		slot.Stored = 0
		slot.Prompt.Enabled = false
		PlotService.refreshSlotGui(slot)
	end
end

function PlotService.refreshSlotGui(slot: Slot, text: string?)
	local label = slot.Gui:FindFirstChild("Text")
	if label and label:IsA("TextLabel") then
		label.Text = text or (slot.ItemId and "" or "EMPTY")
	end
end

-- Spawn the player at the front of their plot.
function PlotService.spawnAtPlot(player: Player)
	local plot = plotByPlayer[player]
	local character = player.Character
	if plot and character then
		character:PivotTo(plot.SpawnCFrame)
	end
end

return PlotService
