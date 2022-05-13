const AWS = require('aws-sdk')
let docClient = new AWS.DynamoDB.DocumentClient()

const Common = require("./common.js")

module.exports.sendResults = (e, c, cb) => { Common.handler(e, c, cb, async (event, context) => {
    let body = JSON.parse(event.body)
    let username = body.data.username
    let score = body.score
    let data = body.data

    let now = Date.now()
    let putResultParams = {
        TableName: process.env.RESULTS_TABLE,
        Item: {
            username: username,
            timestamp: `${now}`,
            score: score,
            createdTime: now,
            data: data
        }
    }
    let putResultPromise = docClient.put(putResultParams).promise().catch((error) => {
        throw error
    })

    let getLeaderboardParams = {
        TableName: process.env.LEADERBOARD_TABLE,
        Key: {"key": "leaderboard0"}
    }
    let leaderboardData
    await docClient.get(getLeaderboardParams).promise().then((response) => {
        if (Object.keys(response).length !== 0 || response.constructor !== Object) {
            leaderboardData = response.Item.data
        } else {
            leaderboardData = []
        }
    }).catch((error) => {
        throw error
    })

    let getPersonalLeaderbaordParams = {
        TableName: process.env.LEADERBOARD_TABLE,
        Key: {"key": username}
    }
    let personalLeaderboardData
    await docClient.get(getPersonalLeaderbaordParams).promise().then((response) => {
        if (Object.keys(response).length !== 0 || response.constructor !== Object) {
            personalLeaderboardData = response.Item.data
        }
    }).catch((error) => {
        throw error
    })

    let newLeaderboardIndex = 0
    let currentLeaderboardIndex = undefined
    for (; newLeaderboardIndex < leaderboardData.length; ++newLeaderboardIndex) {
        let leaderboardLine = leaderboardData[newLeaderboardIndex]
        if (leaderboardLine.username === username) {
            currentLeaderboardIndex = newLeaderboardIndex
        }
        if (score <= leaderboardLine.score) {
            break
        }
    }

    let putPersonalLeaderboardPromise
    let putLeaderboardPromise
    if (personalLeaderboardData === undefined || personalLeaderboardData.score < score) {
        personalLeaderboardData = {
            username: username,
            timestamp: now,
            score: score
        }

        let putPersonalLeaderboardParams = {
            TableName: process.env.LEADERBOARD_TABLE,
            Item: {
                key: username,
                data: personalLeaderboardData
            }
        }
        putPersonalLeaderboardPromise = docClient.put(putPersonalLeaderboardParams).promise().catch((error) => {
            throw error
        })

        let insertOffset = 0
        if (currentLeaderboardIndex !== undefined) {
            insertOffset = 1
            leaderboardData.splice(currentLeaderboardIndex, 1)
        }

        console.log(currentLeaderboardIndex, leaderboardData, personalLeaderboardData)

        leaderboardData.splice(newLeaderboardIndex - insertOffset, 0, {
            score: score,
            username: username,
            timestamp: now
        })

        let putLeaderboardParams = {
            TableName: process.env.LEADERBOARD_TABLE,
            Item: {
                key: "leaderboard0",
                data: leaderboardData
            }
        }
        putLeaderboardPromise = docClient.put(putLeaderboardParams).promise().catch((error) => {
            throw error
        })
    }

    Promise.all([putResultPromise, putLeaderboardPromise, putPersonalLeaderboardPromise])

    return {
        success: true,
        percentile: Math.round((newLeaderboardIndex + 1) / leaderboardData.length * 100),
        rank: Math.max(1, leaderboardData.length - newLeaderboardIndex)
    }
})}

