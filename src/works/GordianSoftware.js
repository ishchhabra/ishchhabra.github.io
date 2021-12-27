import React, { Component } from "react";

export default class GordianSoftware extends Component {
	render() {
		return (
			<div className="row item">
				<div className="twelve columns">
					<h3>
						Software Developer Intern (Python)
						<em className="date">&bull; May 2021 &ndash; Aug 2021</em>
					</h3>
					<p className="info">Gordian Software</p>

					<ul style={{ listStyleType: "disc", paddingLeft: "15px" }}>
						<li>Create software and API to serve clients in the travel industry.</li>
						<li>Develop tests &ndash; unit testing and regression testing.</li>
						<li>Write web scrapers to extract flight data from different airlines.</li>
						<li>Develop solutions to bypass state-of-the-art anti-bot blockers by Akamai and Incapsula to facilitate web scraping.</li>
						<li>Develop tools to decrease development time and increase test coverage.</li>
					</ul>
				</div>
			</div>
		);
	}
}
