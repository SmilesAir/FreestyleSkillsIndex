/* eslint-disable no-loop-func */
"use strict"

const React = require("react")
const ReactDOM = require("react-dom")
const MobxReact = require("mobx-react")
import { Survey } from "survey-react-ui"
import { StylesManager, Model } from "survey-core"
import "survey-core/defaultV2.css"
import ReactLeaderboard from "react-leaderboard"
import Navbar from "responsive-react-js-navbar"

const MainStore = require("mainStore.js")

require("./index.less")

StylesManager.applyTheme("defaultV2")

let awsUrlParam = __STAGE__ === "DEVELOPMENT" ? "wzapn1wai9" : "48oauwfpia"
let stageUrlParam = __STAGE__.toLowerCase()

function getQuestions() {
    // https://docs.google.com/spreadsheets/d/1spkEm3nx8iTdk6T23vGzFh4SVkU6ljaPWaz0774wVxQ/edit?usp=sharing
    fetch(`https://sheets.googleapis.com/v4/spreadsheets/${"1spkEm3nx8iTdk6T23vGzFh4SVkU6ljaPWaz0774wVxQ"}/values/${"English"}?alt=json&key=AIzaSyCxYeJMhqz9fdW2rOqI0sIgQeOLUADCzd8`, {
        headers: {
            "Content-Type": "application/json"
        }
    })
        .then((response) => response.json())
        .then((data) => {
            MainStore.questionsOriginal = []
            for (let rowIndex = 0; rowIndex< data.values.length; ++rowIndex) {
                let row = data.values[rowIndex]
                switch (rowIndex) {
                case 0:
                    MainStore.version = row[0]
                    break
                case 1:
                    break
                default:
                    MainStore.questionsOriginal.push({
                        id: row[0],
                        text: row[1],
                        scoreParams: [
                            row[2],
                            row[3],
                            row[4]
                        ]
                    })
                    break
                }
            }

            if (MainStore.questionsOriginal.length === 0) {
                setTimeout(() => {
                    getQuestions()
                }, 1000)
            }
        }).catch((error) => {
            console.error(error)
        })
}

function getTiers() {
    // https://docs.google.com/spreadsheets/d/1nH7QAo6X6hFcjJI4l3oY88F_gPDXGNRvsPY3i-EVixE/edit?usp=sharing
    fetch(`https://sheets.googleapis.com/v4/spreadsheets/${"1nH7QAo6X6hFcjJI4l3oY88F_gPDXGNRvsPY3i-EVixE"}/values/${"English"}?alt=json&key=AIzaSyCxYeJMhqz9fdW2rOqI0sIgQeOLUADCzd8`, {
        headers: {
            "Content-Type": "application/json"
        }
    })
        .then((response) => response.json())
        .then((data) => {
            MainStore.tiers = []
            for (let row of data.values) {
                MainStore.tiers.push({
                    tier: row[0]
                })
            }

            if (MainStore.tiers.length === 0) {
                setTimeout(() => {
                    getTiers()
                }, 1000)
            }
        })
}

function sendResults(score, data) {
    data.version = MainStore.version

    fetch(`https://${awsUrlParam}.execute-api.us-west-2.amazonaws.com/${stageUrlParam}/sendResults`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            score: score,
            data: data
        })
    }).then((response) => response.json())
        .then((response) => {
            MainStore.percentile = response.percentile
            MainStore.rank = response.rank
            if (MainStore.rank === 1) {
                MainStore.tier = "GOAT"
            } else if (MainStore.tiers.length > 0) {
                let tierIndex = Math.min(MainStore.tiers.length - 1, Math.floor(MainStore.percentile / 100 * MainStore.tiers.length))
                MainStore.tier = MainStore.tiers[tierIndex].tier
            }

            getLeaderboard()
        })
}

function getLeaderboard() {
    let url = `https://${awsUrlParam}.execute-api.us-west-2.amazonaws.com/${stageUrlParam}/getLeaderboard`
    console.log(url)
    fetch(url, {
        method: "GET",
        headers: {
            "Content-Type": "application/json"
        }
    }).then((response) => response.json())
        .then((response) => {
            MainStore.leaderboardData = response.data
        })
}

function recalculateScores() {
    fetch(`https://${awsUrlParam}.execute-api.us-west-2.amazonaws.com/${stageUrlParam}/recalculateScores`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            version: MainStore.version,
            questionData: MainStore.questionsOriginal
        })
    }).then((response) => response.json())
        .then((response) => {
            MainStore.leaderboardData = response.data

            console.log("Score Recalculated", response.data)
        })
}

@MobxReact.observer class Leaderboard extends React.Component {
    constructor() {
        super()

        getLeaderboard()
    }

    render() {
        if (MainStore.leaderboardData === undefined || MainStore.leaderboardData.length <= 0) {
            return (
                <div>
                    <h1>Leaderboard</h1>
                    <h2>No Results</h2>
                </div>
            )
        }

        let users = MainStore.leaderboardData.map((data) => {
            return {
                name: data.username,
                score: data.score
            }
        })

        return (
            <div>
                <ReactLeaderboard users={users} paginate={25} />
            </div>
        )
    }
}

@MobxReact.observer class Results extends React.Component {
    constructor() {
        super()
    }

    onRetake() {
        window.location.reload()
    }

    render() {
        if (this.props.isVisible !== true) {
            return null
        }

        return (
            <div>
                <h2>
                    Score: {this.props.score}
                </h2>
                <h3>
                    Rank: {MainStore.rank}
                </h3>
                <h3>
                    Title: {MainStore.tier}
                </h3>
                <h3>
                    You scored higher than {MainStore.percentile}% of scores
                </h3>
                <hr />
                <button onClick={() => this.onRetake()} >Retake Test</button>
                <hr />
                <Leaderboard />
            </div>
        )
    }
}

@MobxReact.observer class Rules extends React.Component {
    constructor() {
        super()
    }

    render() {
        return (
            <div>
                <h1>
                    Rules
                </h1>
                <h2>
                    <ul>
                        <li>5 Minutes to complete entire test</li>
                        <li>1 try for each skill</li>
                        <li>Only 1 skill can be performed at a time</li>
                        <li>Entire test must be completed by oneself. No Z Machines</li>
                        <li>Skills can be done in any order</li>
                        <li>In order to be validated for the leaderboard, you must submit a single uncut video of your test</li>
                    </ul>
                </h2>
            </div>
        )
    }
}

@MobxReact.observer class Admin extends React.Component {
    constructor() {
        super()
    }

    render() {
        return (
            <div>
                <h1>
                    Admin
                </h1>
                <button onClick={() => recalculateScores()}>Recalculate Scores</button>
            </div>
        )
    }
}

@MobxReact.observer class Main extends React.Component {
    constructor() {
        super()
        this.state = {
            isCompleted: false,
            score: 0
        }

        this.onHashUpdatedHandle = () => {

            this.forceUpdate()
        }

        getQuestions()
        getTiers()

        // setTimeout(() => {
        //     this.testScoreBalance()
        // }, 500)
    }

    testScoreBalance() {
        let data0 = {
            UTL: 2,
            BTB: 2,
            Claps: 3,
            Brushes: 2,
            Catches: 2,
            DelayTime: 5,
            DelayCount: 1,
            Rolls: 1,
            Tips: 1,
            Pulls: 1,
            Spins: 1
        }
        let score0 = this.calcScore(data0, true)
        console.log(score0, data0)

        let data1 = {
            UTL: 63,
            BTB: 26,
            Claps: 23,
            Brushes: 154,
            Catches: 1,
            DelayTime: 46,
            DelayCount: 5,
            Rolls: 5,
            Tips: 5,
            Pulls: 7,
            Spins: 3
        }
        let score1 = this.calcScore(data1, true)
        console.log("Daniel", score1, data1)

        let dataR = {
            UTL: 72,
            BTB: 69,
            Claps: 18,
            Brushes: 115,
            Catches: 16,
            DelayTime: 72,
            DelayCount: 6,
            Rolls: 4,
            Tips: 3,
            Pulls: 6,
            Spins: 2
        }
        let scoreR = this.calcScore(dataR, true)
        console.log("Ryan", scoreR, dataR)

        let dataK = {
            UTL: 4,
            BTB: 9,
            Claps: 17,
            Brushes: 19,
            Catches: 6,
            DelayTime: 51,
            DelayCount: 2,
            Rolls: 4,
            Tips: 8,
            Pulls: 4,
            Spins: 0
        }
        let scoreK = this.calcScore(dataK, true)
        console.log("Katy", scoreK, dataK)

        let data2 = {
            UTL: 70,
            BTB: 70,
            Claps: 30,
            Brushes: 150,
            Catches: 25,
            DelayTime: 80,
            DelayCount: 12,
            Rolls: 30,
            Tips: 20,
            Pulls: 10,
            Spins: 10
        }
        let score2 = this.calcScore(data2, true)
        console.log(score2, data2)
    }

    componentDidMount() {
        window.addEventListener("hashchange", this.onHashUpdatedHandle, false)
    }

    componentWillUnmount() {
        window.removeEventListener("hashchange", this.onHashUpdatedHandle, false)
    }

    calcScoreFunc(id, data) {
        let params = MainStore.questionsOriginal.find((q) => id === q.id).scoreParams
        let input = parseInt(data[id], 10) || 0
        return params[0] * Math.pow(params[1], input / params[2]) - params[0]
    }

    calcScore(data, isVerbose) {
        let score = 0
        for (let question of MainStore.questionsOriginal) {
            let val = this.calcScoreFunc(question.id, data)
            score += val

            if (isVerbose) {
                console.log(question.id, data[question.id], val)
            }
        }

        return Math.round(score)
    }

    onComplete(sender) {
        this.state.score = this.calcScore(sender.data)
        this.state.isCompleted = true
        this.setState(this.state)

        sendResults(this.state.score, sender.data)

        window.localStorage.setItem("username", sender.data.username)
        if (sender.data.city !== undefined) {
            window.localStorage.setItem("city", sender.data.city)
        }
        if (sender.data.fpaMembershipNumber !== undefined) {
            window.localStorage.setItem("fpaMembershipNumber", sender.data.fpaMembershipNumber)
        }
    }

    render() {
        let links = [
            {
                "href": "/#",
                "label": "Home",
                "background": false
            },
            {
                "href": "/#leaderboard",
                "label": "Leaderboard",
                "background": false
            },
            {
                "href": "/#rules",
                "label": "Rules",
                "background": false
            }
        ]

        let json = {
            "title": "Freestyle Skills Index",
            "progressBarType": "buttons",
            "showProgressBar": "top",
            "showQuestionNumbers": "off",
            "pages": [
                {
                    "navigationTitle": "Start",
                    "navigationDescription": "Basic Info",
                    "elements": [
                        {
                            "name": "username",
                            "type": "text",
                            "title": "Please enter your username:",
                            "isRequired": true,
                            "autoComplete": "name",
                            "defaultValue": window.localStorage.getItem("username")
                        },
                        {
                            "name": "city",
                            "type": "text",
                            "title": "What city are you from:",
                            "isRequired": false,
                            "autoComplete": "name",
                            "defaultValue": window.localStorage.getItem("city")
                        },
                        {
                            "name": "fpaMembershipNumber",
                            "type": "text",
                            "title": "FPA Memebership Number:",
                            "isRequired": false,
                            "defaultValue": window.localStorage.getItem("fpaMembershipNumber")
                        },
                    ]
                },
                {
                    "navigationTitle": "Test",
                    "navigationDescription": "5 Minutes",
                    "elements": [
                        {
                            "name": "info",
                            "type": "html",
                            "html": "<h1>Rules</h1><h2>1 try for each skill</h2><h2>5 Minutes to complete entire test</h2><h3>You need to video record your entire test in 1 shot to join the leaderboard</h3>"
                        }
                    ]
                },
                {
                    "navigationTitle": "Validation",
                    "navigationDescription": "Optional",
                    "elements": [
                        {
                            "name": "validationLink",
                            "type": "text",
                            "title": "Video link for validation. Optional"
                        }
                    ]
                }
            ]
        }

        for (let question of MainStore.questionsOriginal) {
            json.pages[1].elements.push({
                "name": question.id,
                "type": "text",
                "title": question.text,
                "isRequired": false,
            })
        }

        let mainElement = null
        if (window.location.hash === "#leaderboard") {
            mainElement = <Leaderboard />
        } else if (window.location.hash === "#rules") {
            mainElement = <Rules />
        } else if (window.location.hash === "#admin") {
            mainElement = <Admin />
        } else if (!this.state.isCompleted) {
            mainElement = <Survey
                model={new Model(json)}
                showCompletedPage={false}
                onComplete={(sender) => this.onComplete(sender)}
            />
        } else {
            mainElement = <Results isVisible={this.state.isCompleted} score={this.state.score} />
        }

        return (
            <div>
                <div>
                    <Navbar links={links} />
                    {mainElement}
                </div>
            </div>
        )
    }
}

ReactDOM.render(
    <Main />,
    document.getElementById("mount")
)
