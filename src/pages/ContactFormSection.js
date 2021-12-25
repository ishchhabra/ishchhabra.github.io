import React, { Component } from "react";

export default class ContactFormSection extends Component {
	render() {
		return (
			<section id="contact">
				<div className="row section-head">
					<div className="ten columns">
						<p className="lead">Feel free to contact me for any work or suggestions below</p>
					</div>
				</div>

				<div className="row">
					<form className="twelve columns" action="#" onSubmit={handleFormSubmit}>
						<div className="input-container">
							<input id="input-name" type="text" name="name" placeholder="name" required />
							<input id="input-email" type="email" name="email" placeholder="email" required />
							<textarea id="input-message" name="message" placeholder="write your message..." required />
							<button id="submit-button" type="submit">
								Send Message
							</button>
						</div>
					</form>
				</div>
			</section>
		);
	}
}

function handleFormSubmit(event) {
	fetch("https://formspree.io/f/maylqdgn", {
		method: "POST",
		headers: {
			Accept: "application/json",
		},
		body: new FormData(event.target),
	}).then((response) => {
		if (response.ok) {
			alert("Messsage sent successfully!");
			event.target.reset();
		} else {
			// Have to decide what to do here...
		}
	});

	event.preventDefault();
}
