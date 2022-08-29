(() => {
	const QuestionType = {
		CHOICES: "choices",

		UNKNOWN: "unknown"
	};

	/* eslint-disable camelcase */
	const CLASS_QUESTION_TYPE = {
		true_false_question: QuestionType.CHOICES
	};
	/* eslint-enable camelcase */

	const REGEX_QUESTION_ID = /^question_(?<id>\d+)$/u;
	const REGEX_ANSWER_ID = /^answer-(?<id>\d+)$/u;



	class QuestionInfo {
		constructor(
			questionId,
			questionType,
			answerInfo
		) {
			Object.assign(
				this,
				{
					questionId,
					questionType,
					answerInfo
				}
			);
		}

		export() {
			return {
				questionId: this.questionId,
				questionType: this.questionType,
				answerInfo: this.answerInfo.export()
			};
		}
	}

	class AnswerInfo {
		constructor(
			questionType,
			answers
		) {
			Object.assign(
				this,
				{
					questionType,
					answers
				}
			);
		}

		export() {
			return {
				questionType: this.questionType,
				answers: this.answers
			};
		}
	}

	class ChoicesAnswerInfo extends AnswerInfo {
		constructor(checkedAnswerIds) {
			super(
				QuestionType.CHOICES,
				checkedAnswerIds
			);
		}
	}



	function l(content, group = false) {
		let consoleFunction = (!group) ? console.log : console.group;
		consoleFunction(
			// Skip instanceof check for type object + class String from new String()s
			(typeof content !== "string")
				? content
				: `>>> ${content}`
		);
	}

	function w(content) {
		console.warn(
			(typeof content !== "string")
				? content
				: `[!] ${content}!`
		);
	}

	function e(content) {
		console.error(
			(typeof content !== "string")
				? content
				: `ERR ${content}!`
		);
	}

	function d(content) {
		console.debug(
			(typeof content !== "string")
				? content
				: `*** ${content}`
		);
	}



	class QuestionManager {
		cannotProceed = false;

		successCount = 0;
		questionCount = 0;
		questionInfos = [];

		constructor(scan) {
			for (let question of scan.questions) {
				this.questionCount++;
				l(`⚙️ Processing page's Q${this.questionCount}...`, true);

				// Process question ID
				let elementId = question.id;
				if (elementId === "") {
					e("Question has no element ID");
					console.groupEnd();
					continue;
				}

				let result = REGEX_QUESTION_ID.exec(elementId);
				if (result === null) {
					e("Unrecognised element ID format for question");
					console.groupEnd();
					continue;
				}

				let questionId = parseInt(result.groups.id);

				// Process question type
				let questionType = this.#processQuestionType;
				if (questionType === QuestionType.UNKNOWN) {
					e("⚠️ This queston type isn't supported");
					console.groupEnd();
					continue;
				}

				let answerInfo = null;
				if (scan.extractorMode) {
					// Process question for answer info

					let answersHolder = question.querySelector("div.answers");
					if (answersHolder === null) {
						e("No answers holder found in question");
						console.groupEnd();
						continue;
					}

					switch (questionType) {
						case QuestionType.CHOICES:
							answerInfo = this.#processAnswerChoices(answersHolder);
							break;
					}
				}

				let questionInfo = new QuestionInfo(
					questionId,
					questionType,
					answerInfo
				);
				d(questionInfo);

				this.questionInfos.push(questionInfo);
				this.successCount++;
				console.groupEnd();
			}

			l(`📦 Processed ${this.successCount}/${this.questionCount} questions`);
			d(this.questionInfos);
		}

		#processQuestionType(question) {
			for (let [className, questionType] of Object.entries(CLASS_QUESTION_TYPE)) {
				if (question.classList.contains(className)) return questionType;
			}

			return QuestionType.UNKNOWN;
		}

		#processAnswerChoices(answersHolder) {
			let radioButtons = answersHolder.querySelectorAll("input[type=radio]");
			if (radioButtons.length === 0) {
				e("No radio buttons found in answers holder");
				return null;
			}

			let checkedAnswerIds = [];
			for (let radioButton of radioButtons) {
				if (radioButton.checked) {
					let elementId = radioButton.id;
					if (elementId === "") {
						e("Radio button has no element ID");
						continue;
					}

					let result = REGEX_ANSWER_ID.exec(elementId);
					if (result === null) {
						e("Unrecognised element ID format for radio button");
						continue;
					}

					let answerId = parseInt(result.groups.id);
					checkedAnswerIds.push(answerId);
				}
			}

			return new ChoicesAnswerInfo(checkedAnswerIds);
		}
	}

	class Scan {
		cannotProceed = false;

		extractorMode = true;
		questions = [];

		constructor() {
			let questionsHolder = document.querySelector("div#questions");
			if (questionsHolder === null) {
				e("Can neither extract nor import (no questions holder found in document)");
				this.cannotProceed = true;
				return;
			}

			if (questionsHolder.classList.contains("assessment_results")) {
				// Quiz results
				l("📈 Using extractor mode");
				this.extractorMode = true;
			} else if (questionsHolder.classList.contains("assessing")) {
				// Ongoing quiz
				l("🪄 Using importer mode");
				this.extractorMode = false;
			} else {
				e("Can neither extract nor import (unknown kind of questions holder)");
				this.cannotProceed = true;
				return;
			}

			this.questions = questionsHolder.querySelectorAll("div.question");
		}

		process() {
			return new QuestionManager(this);
		}
	}



	let scan = new Scan();
	if (scan.cannotProceed) return;

	let questionManager = scan.process();
	if (questionManager.cannotProceed) return;

	if (scan.extractorMode) {
		questionManager.store();
		l("✅ Your answers have been extracted & stored. Run this script again on an ongoing quiz attempt to import them");
	} else {
		let storedData = new StoredData();
		if (storedData.cannotProceed) return;

		questionManager.import(storedData);
		l("✅ Your answers have been retrieved & imported. Matching questions have been overwritten");
	}
})();
