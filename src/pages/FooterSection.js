import React, { Component } from "react";

export default class FooterSection extends Component {
	render() {
		let resumeData = this.props.resumeData;

		return (
			<footer>
				<div className="row">
					<div className="twelve columns">
						<ul className="social-links">
							<li key="linkedin">
								<a href={resumeData.linkedin} target="_blank">
									<i className="fa fa-linkedin"></i>
								</a>
							</li>

							<li key="github">
								<a href={resumeData.github} target="_blank">
									<i className="fa fa-github"></i>
								</a>
							</li>
						</ul>
					</div>
					<div id="go-top">
						<a className="smoothscroll" title="Back to Top" href="#home">
							<i className="icon-up-open" />
						</a>
					</div>
				</div>
			</footer>
		);
	}
}
