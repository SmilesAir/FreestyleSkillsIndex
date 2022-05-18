"use strict"

const Mobx = require("mobx")

module.exports = Mobx.observable({
    questionsOriginal: [],
    tier: "Loading...",
    percentile: "Loading...",
    version: undefined,
    leaderboardData: undefined,
    resultDetailsData: undefined
})
