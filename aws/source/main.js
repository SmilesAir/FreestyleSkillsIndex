const AWS = require('aws-sdk')
let docClient = new AWS.DynamoDB.DocumentClient()

const Common = require("./common.js")

module.exports.sendResults = (e, c, cb) => { Common.handler(e, c, cb, async (event, context) => {
    let body = JSON.parse(event.body)
    let username = body.data.username
    let score = body.score
    let data = body.data
    let version = body.data.version

    let now = Date.now()
    let putResultParams = {
        TableName: process.env.RESULTS_TABLE,
        Item: {
            username: username,
            timestamp: `${now}`,
            score: score,
            createdTime: now,
            data: data,
            version: version
        }
    }
    let putResultPromise = docClient.put(putResultParams).promise().catch((error) => {
        throw error
    })

    let getPersonalLeaderboardParams = {
        TableName: process.env.LEADERBOARD_TABLE,
        Key: {"key": username}
    }
    let personalLeaderboardData
    await docClient.get(getPersonalLeaderboardParams).promise().then((response) => {
        if (Object.keys(response).length !== 0 || response.constructor !== Object) {
            personalLeaderboardData = response.Item.data
        }
    }).catch((error) => {
        throw error
    })

    let leaderboardData = await getLeaderboardData()
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
            score: score,
            validationLink: data.validationLink
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

        leaderboardData.splice(newLeaderboardIndex - insertOffset, 0, {
            score: score,
            username: username,
            timestamp: now,
            validationLink: data.validationLink,
            isValidated: false
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
        percentile: Math.round(newLeaderboardIndex / leaderboardData.length * 100),
        rank: Math.max(1, leaderboardData.length - newLeaderboardIndex)
    }
})}

module.exports.getLeaderboard = (e, c, cb) => { Common.handler(e, c, cb, async (event, context) => {
    let leaderboardData = await getLeaderboardData()

    return {
        success: true,
        data: leaderboardData
    }
})}

module.exports.getResultDetails = (e, c, cb) => { Common.handler(e, c, cb, async (event, context) => {
    let username = decodeURI(event.pathParameters.username)
    let leaderboardData = await getLeaderboardData()

    let resultDetails
    let leaderboardEntry = leaderboardData.find((data) => data.username === username)
    if (leaderboardEntry !== undefined) {
        let getResultParams = {
            TableName: process.env.RESULTS_TABLE,
            Key: {
                username: leaderboardEntry.username,
                timestamp: `${leaderboardEntry.timestamp}`
            }
        }
        await docClient.get(getResultParams).promise().then((response) => {
            if (Object.keys(response).length !== 0 || response.constructor !== Object) {
                resultDetails = response.Item.data
            }
        }).catch((error) => {
            throw error
        })
    }
    else
    {
        throw `Can't find result data for ${username}`
    }

    return {
        success: true,
        data: resultDetails
    }
})}

function getLeaderboardData() {
    let getLeaderboardParams = {
        TableName: process.env.LEADERBOARD_TABLE,
        Key: {"key": "leaderboard0"}
    }
    let leaderboardData
    return docClient.get(getLeaderboardParams).promise().then((response) => {
        if (Object.keys(response).length !== 0 || response.constructor !== Object) {
            leaderboardData = response.Item.data
        } else {
            leaderboardData = []
        }

        return leaderboardData
    }).catch((error) => {
        throw error
    })
}

module.exports.recalculateScores = (e, c, cb) => { Common.handler(e, c, cb, async (event, context) => {
    let body = JSON.parse(event.body)
    let version = body.version
    let questionData = body.questionData

    let leaderboardData = await getLeaderboardData()

    const maxBatchGetCount = 100
    const maxBatchWriteCount = 25
    let getItems = []
    let needUpdateList = []
    for (let leaderboardIndex = 0; leaderboardIndex < leaderboardData.length; ++leaderboardIndex) {
        let entry = leaderboardData[leaderboardIndex]
        if (entry.version !== version) {
            getItems.push({
                username: entry.username,
                timestamp: `${entry.timestamp}`
            })

            entry.version = version
        }

        if (getItems.length > 0 && (getItems.length === maxBatchGetCount || leaderboardIndex === leaderboardData.length - 1)) {
            let batchGetParams = {
                RequestItems: {
                    [process.env.RESULTS_TABLE]: {
                        Keys: getItems
                    }
                }
            }
            await docClient.batchGet(batchGetParams).promise().then((response) => {
                needUpdateList = needUpdateList.concat(response.Responses[process.env.RESULTS_TABLE])
            }).catch((error) => {
                throw error
            })

            getItems = []
        }
    }

    let writeResultItems = []
    let writeLeaderboardItems = []
    for (let updateIndex = 0; updateIndex < needUpdateList.length; ++updateIndex) {
        let entry = needUpdateList[updateIndex]
        let newScore = calcScore(entry.data, questionData)
        let leaderboardEntry = leaderboardData.find((other) => {
            return other.username === entry.username
        })
        if (leaderboardEntry !== undefined) {
            leaderboardEntry.score = newScore
        }

        writeResultItems.push({
            PutRequest: {
                Item: {
                    username: entry.username,
                    timestamp: entry.timestamp,
                    updatedTime: Date.now(),
                    data: entry.data,
                    version: version,
                    score: newScore
                }
            }
        })
        writeLeaderboardItems.push({
            PutRequest: {
                Item: {
                    key: entry.username,
                    data: {
                        score: newScore,
                        username: entry.username,
                        timestamp: Date.now()
                    }
                }
            }
        })

        if (writeResultItems.length === maxBatchWriteCount || updateIndex === needUpdateList.length - 1) {
            let resultsBatchWriteParams = {
                RequestItems: {
                    [process.env.RESULTS_TABLE]: writeResultItems
                }
            }
            await docClient.batchWrite(resultsBatchWriteParams).promise().catch((error) => {
                throw error
            })

            let leaderboardBatchWriteParams = {
                RequestItems: {
                    [process.env.LEADERBOARD_TABLE]: writeLeaderboardItems
                }
            }
            await docClient.batchWrite(leaderboardBatchWriteParams).promise().catch((error) => {
                throw error
            })

            writeResultItems = []
            writeLeaderboardItems = []
        }
    }

    if (needUpdateList.length > 0) {
        let putLeaderboardParams = {
            TableName: process.env.LEADERBOARD_TABLE,
            Item: {
                key: "leaderboard0",
                data: leaderboardData
            }
        }
        await docClient.put(putLeaderboardParams).promise().catch((error) => {
            throw error
        })
    }

    return {
        success: true,
        data: leaderboardData
    }
})}

function calcScoreFunc(id, data, questionData) {
    let params = questionData.find((q) => id === q.id).scoreParams
    let input = parseInt(data[id], 10) || 0

    switch (params[3]) {
    case "Exponential":
        return params[0] * Math.pow(params[1], input / params[2]) - params[0]
    case "Linear":
        return params[0] * input
    case "Logarithmic":
        return params[0] * Math.pow(input / params[2], params[1])
    }

    return 0
}

function calcScore(data, questionData) {
    let score = 0
    for (let question of questionData) {
        let val = calcScoreFunc(question.id, data, questionData)
        score += val

        let input = parseInt(data[question.id], 10) || 0
        console.log(question.id, input, val)
    }

    return Math.round(score)
}