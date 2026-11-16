--!strict
-- Plays one-shot sounds requested by the server and loops the background music.
-- Uses ids from Shared/Assets; keys with id 0 are silently skipped until uploaded.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local SoundService = game:GetService("SoundService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Assets = require(Shared.Assets)
local Remotes = require(Shared.Remotes)

local Sounds = {}

local VOLUMES: { [string]: number } = {
	Pickup = 0.7,
	Place = 0.7,
	Collect = 0.8,
	StealAlarm = 0.9,
	Lock = 0.8,
	Whack = 0.9,
	RareSpawn = 0.8,
	Click = 0.4,
	Deny = 0.6,
}

local group: SoundGroup
local music: Sound? = nil
local musicEnabled = true

local cache: { [string]: Sound } = {}

local function getSound(key: string): Sound?
	local existing = cache[key]
	if existing then
		return existing
	end
	local id = Assets.soundId(key)
	if not id then
		return nil
	end
	local s = Instance.new("Sound")
	s.Name = key
	s.SoundId = id
	s.Volume = VOLUMES[key] or 0.7
	s.SoundGroup = group
	s.Parent = SoundService
	cache[key] = s
	return s
end

function Sounds.play(key: string)
	local s = getSound(key)
	if s then
		-- Clone so overlapping plays don't cut each other off
		local c = s:Clone()
		c.Parent = SoundService
		c.PlaybackSpeed = 0.95 + math.random() * 0.1
		c:Play()
		c.Ended:Once(function()
			c:Destroy()
		end)
	end
end

function Sounds.setMusicEnabled(enabled: boolean)
	musicEnabled = enabled
	if music then
		if enabled then
			music:Play()
		else
			music:Stop()
		end
	end
end

function Sounds.isMusicEnabled(): boolean
	return musicEnabled
end

function Sounds.init()
	group = Instance.new("SoundGroup")
	group.Name = "SFX"
	group.Volume = 1
	group.Parent = SoundService

	local musicId = Assets.soundId("MusicMain")
	if musicId then
		local m = Instance.new("Sound")
		m.Name = "Music"
		m.SoundId = musicId
		m.Looped = true
		m.Volume = 0.22
		m.Parent = SoundService
		m:Play()
		music = m
	end

	local conveyorId = Assets.soundId("ConveyorLoop")
	if conveyorId then
		local belt = workspace:WaitForChild("Map", 10)
		local beltPart = belt and belt:WaitForChild("ConveyorBelt", 10)
		if beltPart then
			local s = Instance.new("Sound")
			s.SoundId = conveyorId
			s.Looped = true
			s.Volume = 0.35
			s.RollOffMaxDistance = 90
			s.RollOffMinDistance = 15
			s.Parent = beltPart
			s:Play()
		end
	end

	Remotes.get(Remotes.Names.PlaySound).OnClientEvent:Connect(function(key: string)
		Sounds.play(key)
	end)
end

return Sounds
