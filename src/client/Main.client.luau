--!strict
-- Steal a Nunhead - client bootstrap.

local HUD = require(script.Parent.HUD)
local Sounds = require(script.Parent.Sounds)
local PlotClient = require(script.Parent.PlotClient)

Sounds.init()
HUD.init()
PlotClient.init()
