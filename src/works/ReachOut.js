import React, { Component } from "react";

export default class ReachOut extends Component {
	render() {
		return (
			<div className="row item">
				<div className="twelve columns">
					<h3>
						Full Stack Developer Intern
						<em className="date">&bull; June 2020 &ndash; Aug 2020</em>
					</h3>
					<p className="info">CICS, UMass</p>

					<ul style={{ listStyleType: "disc", paddingLeft: "15px" }}>
						<li>
							Project{" "}
							<b>
								<a href="https://reachout.cics.umass.edu" target="_blank">
									ReachOUT
								</a>
							</b>
						</li>
						<li>Integrate multiple endpoints of the application with AWS S3.</li>
						<li>Design, develop, and validate multiple React components to render the component.</li>
						<li>Write AWS Lambda functions in Python to expose API endpoints for the frontend.</li>
						<li>Implement string internationalization and time-zone conversion for the application to increase availability to foreign users.</li>
						<li>Backend Optimization to reduce data transfer between the client and the host by 3x.</li>
					</ul>
				</div>
			</div>
		);
	}
}
