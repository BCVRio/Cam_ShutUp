--!strict
-- On-screen UI: cash + income, carrying banner, lock button, rare-spawn ticker, toasts.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Format = require(Shared.Format)
local Rarity = require(Shared.Rarity)
local Palette = require(Shared.Palette)
local Remotes = require(Shared.Remotes)

local Sounds = require(script.Parent.Sounds)

local HUD = {}

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local FONT = Enum.Font.FredokaOne
local GREEN = Color3.fromRGB(40, 100, 70)
local CREAM = Color3.fromRGB(245, 236, 214)
local GOLD = Color3.fromRGB(255, 200, 40)
local RED = Color3.fromRGB(220, 60, 60)

local KIND_COLORS: { [string]: Color3 } = {
	info = Color3.fromRGB(70, 130, 200),
	good = Color3.fromRGB(60, 170, 90),
	bad = RED,
	steal = Color3.fromRGB(255, 120, 30),
}

local gui: ScreenGui
local cashLabel: TextLabel
local incomeLabel: TextLabel
local carryFrame: Frame
local carryLabel: TextLabel
local lockButton: TextButton
local lockLabel: TextLabel
local toastList: Frame
local rareBanner: Frame
local rareLabel: TextLabel

local lockRemaining = 0
local cooldownRemaining = 0

-- ───────────────────────── helpers ─────────────────────────

local function corner(parent: GuiObject, radius: number)
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, radius)
	c.Parent = parent
end

local function stroke(parent: GuiObject, color: Color3, thickness: number)
	local s = Instance.new("UIStroke")
	s.Color = color
	s.Thickness = thickness
	s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	s.Parent = parent
end

local function label(parent: GuiObject, text: string, size: number, color: Color3): TextLabel
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.Text = text
	l.TextSize = size
	l.TextColor3 = color
	l.Font = FONT
	l.TextStrokeTransparency = 0.6
	l.Parent = parent
	return l
end

local function pop(obj: GuiObject)
	local scale = obj:FindFirstChildOfClass("UIScale") or Instance.new("UIScale")
	scale.Scale = 1.15
	scale.Parent = obj
	TweenService:Create(scale, TweenInfo.new(0.25, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = 1 }):Play()
end

-- ───────────────────────── build ─────────────────────────

local function build()
	gui = Instance.new("ScreenGui")
	gui.Name = "StealANunheadHUD"
	gui.ResetOnSpawn = false
	gui.IgnoreGuiInset = false
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	gui.Parent = playerGui

	-- Cash panel (top-left)
	local cashPanel = Instance.new("Frame")
	cashPanel.Name = "CashPanel"
	cashPanel.Size = UDim2.fromOffset(260, 96)
	cashPanel.Position = UDim2.fromOffset(16, 16)
	cashPanel.BackgroundColor3 = GREEN
	cashPanel.BackgroundTransparency = 0.1
	cashPanel.Parent = gui
	corner(cashPanel, 14)
	stroke(cashPanel, CREAM, 3)

	local title = label(cashPanel, Config.GameName:upper(), 16, CREAM)
	title.Size = UDim2.new(1, -16, 0, 20)
	title.Position = UDim2.fromOffset(12, 6)
	title.TextXAlignment = Enum.TextXAlignment.Left

	cashLabel = label(cashPanel, "£0", 40, GOLD)
	cashLabel.Size = UDim2.new(1, -16, 0, 44)
	cashLabel.Position = UDim2.fromOffset(12, 24)
	cashLabel.TextXAlignment = Enum.TextXAlignment.Left

	incomeLabel = label(cashPanel, "£0/s", 16, CREAM)
	incomeLabel.Size = UDim2.new(1, -16, 0, 20)
	incomeLabel.Position = UDim2.fromOffset(12, 68)
	incomeLabel.TextXAlignment = Enum.TextXAlignment.Left

	-- Carrying banner (bottom-centre)
	carryFrame = Instance.new("Frame")
	carryFrame.Name = "Carrying"
	carryFrame.AnchorPoint = Vector2.new(0.5, 1)
	carryFrame.Size = UDim2.fromOffset(460, 54)
	carryFrame.Position = UDim2.new(0.5, 0, 1, -24)
	carryFrame.BackgroundColor3 = Color3.fromRGB(30, 30, 35)
	carryFrame.BackgroundTransparency = 0.15
	carryFrame.Visible = false
	carryFrame.Parent = gui
	corner(carryFrame, 12)
	stroke(carryFrame, GOLD, 2)
	carryLabel = label(carryFrame, "", 20, CREAM)
	carryLabel.Size = UDim2.fromScale(1, 1)
	carryLabel.TextWrapped = true

	-- Lock button (bottom-right)
	lockButton = Instance.new("TextButton")
	lockButton.Name = "LockButton"
	lockButton.AnchorPoint = Vector2.new(1, 1)
	lockButton.Size = UDim2.fromOffset(190, 64)
	lockButton.Position = UDim2.new(1, -16, 1, -24)
	lockButton.BackgroundColor3 = Color3.fromRGB(60, 150, 220)
	lockButton.Text = ""
	lockButton.AutoButtonColor = true
	lockButton.Parent = gui
	corner(lockButton, 14)
	stroke(lockButton, CREAM, 3)
	lockLabel = label(lockButton, "LOCK BASE", 22, CREAM)
	lockLabel.Size = UDim2.fromScale(1, 1)
	lockLabel.TextWrapped = true
	lockButton.Activated:Connect(function()
		Sounds.play("Click")
		Remotes.get(Remotes.Names.RequestLock):FireServer()
	end)

	-- Music toggle (bottom-right, above lock)
	local musicButton = Instance.new("TextButton")
	musicButton.Name = "MusicButton"
	musicButton.AnchorPoint = Vector2.new(1, 1)
	musicButton.Size = UDim2.fromOffset(190, 34)
	musicButton.Position = UDim2.new(1, -16, 1, -96)
	musicButton.BackgroundColor3 = Color3.fromRGB(50, 50, 60)
	musicButton.Text = ""
	musicButton.Parent = gui
	corner(musicButton, 10)
	local musicLabel = label(musicButton, "♫ MUSIC: ON", 16, CREAM)
	musicLabel.Size = UDim2.fromScale(1, 1)
	musicButton.Activated:Connect(function()
		local on = not Sounds.isMusicEnabled()
		Sounds.setMusicEnabled(on)
		musicLabel.Text = on and "♫ MUSIC: ON" or "♫ MUSIC: OFF"
	end)

	-- Controls hint (bottom-left)
	local hint = label(gui, "Walk up to the belt and press E to buy  •  Walk into your pedestal to place  •  Hold E on someone else's to STEAL  •  Click to swing your bat", 14, CREAM)
	hint.AnchorPoint = Vector2.new(0, 1)
	hint.Size = UDim2.new(0.5, 0, 0, 40)
	hint.Position = UDim2.new(0, 16, 1, -16)
	hint.TextXAlignment = Enum.TextXAlignment.Left
	hint.TextWrapped = true
	hint.TextTransparency = 0.25

	-- Toasts (right side)
	toastList = Instance.new("Frame")
	toastList.Name = "Toasts"
	toastList.AnchorPoint = Vector2.new(1, 0)
	toastList.Size = UDim2.fromOffset(340, 400)
	toastList.Position = UDim2.new(1, -16, 0, 16)
	toastList.BackgroundTransparency = 1
	toastList.Parent = gui
	local layout = Instance.new("UIListLayout")
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Padding = UDim.new(0, 6)
	layout.HorizontalAlignment = Enum.HorizontalAlignment.Right
	layout.Parent = toastList

	-- Rare spawn banner (top-centre)
	rareBanner = Instance.new("Frame")
	rareBanner.Name = "RareBanner"
	rareBanner.AnchorPoint = Vector2.new(0.5, 0)
	rareBanner.Size = UDim2.fromOffset(520, 56)
	rareBanner.Position = UDim2.new(0.5, 0, 0, -70)
	rareBanner.BackgroundColor3 = Color3.fromRGB(30, 30, 35)
	rareBanner.BackgroundTransparency = 0.1
	rareBanner.Parent = gui
	corner(rareBanner, 12)
	stroke(rareBanner, GOLD, 3)
	rareLabel = label(rareBanner, "", 22, GOLD)
	rareLabel.Size = UDim2.fromScale(1, 1)
	rareLabel.TextWrapped = true
end

-- ───────────────────────── behaviour ─────────────────────────

local function updateCash()
	local v = player:GetAttribute("Cash")
	if typeof(v) == "number" then
		cashLabel.Text = Format.cash(v)
		pop(cashLabel)
	end
end

local function updateIncome()
	local plots = workspace:FindFirstChild("Plots")
	if not plots then
		return
	end
	for _, m in plots:GetChildren() do
		if m:GetAttribute("OwnerUserId") == player.UserId then
			local inc = m:GetAttribute("Income")
			incomeLabel.Text = Format.income(typeof(inc) == "number" and inc or 0)
			return
		end
	end
end

local toastCount = 0
function HUD.toast(message: string, kind: string?)
	toastCount += 1
	local f = Instance.new("Frame")
	f.Size = UDim2.new(1, 0, 0, 0)
	f.AutomaticSize = Enum.AutomaticSize.Y
	f.BackgroundColor3 = KIND_COLORS[kind or "info"] or KIND_COLORS.info
	f.BackgroundTransparency = 0.1
	f.LayoutOrder = toastCount
	f.Parent = toastList
	corner(f, 10)
	local l = label(f, message, 16, Color3.new(1, 1, 1))
	l.Size = UDim2.new(1, -20, 0, 0)
	l.Position = UDim2.fromOffset(10, 0)
	l.AutomaticSize = Enum.AutomaticSize.Y
	l.TextWrapped = true
	l.TextXAlignment = Enum.TextXAlignment.Left
	local pad = Instance.new("UIPadding")
	pad.PaddingTop = UDim.new(0, 8)
	pad.PaddingBottom = UDim.new(0, 8)
	pad.Parent = f
	pop(f)
	task.delay(4.5, function()
		TweenService:Create(f, TweenInfo.new(0.4), { BackgroundTransparency = 1 }):Play()
		TweenService:Create(l, TweenInfo.new(0.4), { TextTransparency = 1, TextStrokeTransparency = 1 }):Play()
		task.wait(0.45)
		f:Destroy()
	end)
	-- cap the list
	local children = toastList:GetChildren()
	local frames = {}
	for _, c in children do
		if c:IsA("Frame") then
			table.insert(frames, c)
		end
	end
	if #frames > 6 then
		table.sort(frames, function(a, b)
			return a.LayoutOrder < b.LayoutOrder
		end)
		frames[1]:Destroy()
	end
end

local function showRare(name: string, rarity: string)
	local info = Rarity.get(rarity)
	rareLabel.Text = string.format("%s on the belt: %s!", info.Label, name)
	rareLabel.TextColor3 = Palette.rgb(info.ColorRGB)
	local s = rareBanner:FindFirstChildOfClass("UIStroke")
	if s then
		s.Color = Palette.rgb(info.ColorRGB)
	end
	TweenService:Create(rareBanner, TweenInfo.new(0.4, Enum.EasingStyle.Back), { Position = UDim2.new(0.5, 0, 0, 16) }):Play()
	task.delay(5, function()
		TweenService:Create(rareBanner, TweenInfo.new(0.4, Enum.EasingStyle.Quad, Enum.EasingDirection.In), { Position = UDim2.new(0.5, 0, 0, -70) }):Play()
	end)
end

local function updateLockButton()
	if lockRemaining > 0 then
		lockButton.BackgroundColor3 = Color3.fromRGB(60, 190, 110)
		lockLabel.Text = "LOCKED  " .. Format.clock(lockRemaining)
	elseif cooldownRemaining > 0 then
		lockButton.BackgroundColor3 = Color3.fromRGB(110, 110, 120)
		lockLabel.Text = "RECHARGING  " .. Format.clock(cooldownRemaining)
	else
		lockButton.BackgroundColor3 = Color3.fromRGB(60, 150, 220)
		lockLabel.Text = "LOCK BASE"
	end
end

function HUD.init()
	build()

	updateCash()
	player:GetAttributeChangedSignal("Cash"):Connect(updateCash)

	Remotes.get(Remotes.Names.Notify).OnClientEvent:Connect(function(message: string, kind: string?)
		HUD.toast(message, kind)
	end)

	Remotes.get(Remotes.Names.CarryChanged).OnClientEvent:Connect(function(itemName: string?, rarity: string?)
		if itemName then
			local info = Rarity.get(rarity or "Common")
			carryLabel.Text = string.format("Carrying: %s  •  take it to one of your pedestals", itemName)
			carryLabel.TextColor3 = Palette.rgb(info.ColorRGB)
			carryFrame.Visible = true
			pop(carryFrame)
		else
			carryFrame.Visible = false
		end
	end)

	Remotes.get(Remotes.Names.RareSpawn).OnClientEvent:Connect(showRare)

	Remotes.get(Remotes.Names.LockState).OnClientEvent:Connect(function(lockedFor: number, cooldownFor: number)
		lockRemaining = lockedFor
		cooldownRemaining = cooldownFor
		updateLockButton()
	end)

	-- Timers + income refresh
	local acc = 0
	RunService.Heartbeat:Connect(function(dt)
		if lockRemaining > 0 then
			lockRemaining = math.max(0, lockRemaining - dt)
		end
		if cooldownRemaining > 0 then
			cooldownRemaining = math.max(0, cooldownRemaining - dt)
		end
		acc += dt
		if acc > 0.5 then
			acc = 0
			updateLockButton()
			updateIncome()
		end
	end)
end

return HUD
