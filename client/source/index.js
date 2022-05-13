/* eslint-disable no-loop-func */
"use strict"

const React = require("react")
const ReactDOM = require("react-dom")
const MobxReact = require("mobx-react")
import { Survey } from "survey-react-ui"
import { StylesManager, Model } from "survey-core"
import "survey-core/defaultV2.css"
import mainStore from "./mainStore"

const MainStore = require("mainStore.js")

require("./index.less")

StylesManager.applyTheme("defaultV2")


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
            for (let row of data.values) {
                MainStore.questionsOriginal.push({
                    id: row[0],
                    text: row[1],
                    scoreParams: [
                        row[2],
                        row[3],
                        row[4]
                    ]
                })
            }
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
        })
}

function sendResults(score, data) {
    fetch("https://d91qmid7sb.execute-api.us-west-2.amazonaws.com/development/sendResults", {
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
            console.log(response)

            MainStore.percentile = response.percentile
            MainStore.rank = response.rank
            if (mainStore.rank === 1) {
                MainStore.tier = "GOAT"
            } else if (MainStore.tiers.length > 0) {
                let tierIndex = Math.min(MainStore.tiers.length - 1, Math.floor(MainStore.percentile / 100 * MainStore.tiers.length))
                MainStore.tier = MainStore.tiers[tierIndex].tier
            }
        })
}

@MobxReact.observer class Results extends React.Component {
    constructor() {
        super()
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
                <div>
                    Rank: {MainStore.rank}
                </div>
                <div>
                    Title: {MainStore.tier}
                </div>
                <div>
                    You scored higher than {MainStore.percentile}% of scores
                </div>
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

        getQuestions()
        getTiers()
    }

    calcScoreFunc(id, sender) {
        let params = MainStore.questionsOriginal.find((q) => id === q.id).scoreParams
        let input = parseInt(sender.data[id], 10) || 0
        return params[0] * Math.pow(params[1], input / params[2]) - params[0]
    }

    onComplete(sender) {
        this.state.score = this.calcScoreFunc("UTL", sender)
        this.state.score += this.calcScoreFunc("BTB", sender)

        this.state.score = Math.round(this.state.score)

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
        let json = {
            "title": "Freestyle Skills Index",
            "progressBarType": "buttons",
            "showProgressBar": "top",
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
                    "navigationDescription": "10 Minutes",
                    "elements": [
                        {
                            "name": "info",
                            "type": "html",
                            "html": "<h1>Rules</h1><h2>1 try for each skill</h2><h3>You need to video record your entire test in 1 shot to join the leaderboard</h3>"
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

        let surveyRender = !this.state.isCompleted ?
            <Survey
                json={json}
                showCompletedPage={false}
                onComplete={(sender) => this.onComplete(sender)}
            /> :
            null

        return (
            <div>
                <div>
                    {surveyRender}
                    <Results isVisible={this.state.isCompleted} score={this.state.score} />
                </div>
            </div>
        )
    }
}

ReactDOM.render(
    <Main />,
    document.getElementById("mount")
)
