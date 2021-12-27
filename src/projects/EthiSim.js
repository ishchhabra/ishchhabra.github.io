import React, { Component } from "react";

export default class EthiSim extends Component {
	render() {
		return (
			<div className="row item">
				<div className="twelve columns">
					<h3>
						EthiSim (Ethics Simulator)
						<em className="date">&bull; Feb 2020 &ndash; May 2020</em>
					</h3>
					<p className="info">University of Massachusetts Amherst</p>

					<ul style={{ listStyleType: "disc", paddingLeft: "15px" }}>
						<li>Install, configure, and maintain Apache web server on CentOS 8.</li>
						<li>Install and configure Shibboleth Service Provider as a module on Apache to integrate UMass Single Sign-On with the web application.</li>
						<li>Integrate SSO with Django endpoints.</li>
						<li>Implement reverse proxy to forward requests to multiple applications running inside separate docker containers.</li>
					</ul>
				</div>
			</div>
		);
	}
}
