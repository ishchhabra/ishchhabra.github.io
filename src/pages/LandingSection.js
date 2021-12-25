import React, { Component } from "react";
import NavigationBar from "../components/NavigationBar";

export default class LandingSection extends Component {
	render() {
		let resumeData = this.props.resumeData;

		return (
			<header id="home">
				<NavigationBar />

				<div className="row banner">
					<div className="banner-text">
						<h1 className="responsive-headline">
							Hello, my name is <br />
							{resumeData.first_name} {resumeData.last_name}.
						</h1>
						<h3 style={{ color: "#fff", fontFamily: "sans-serif " }}>{resumeData.description}</h3>
						<hr />
						<ul className="social">
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
				</div>

				<p className="scrolldown">
					<a className="smoothscroll" href="#about">
						<i className="icon-down-circle"></i>
					</a>
				</p>
			</header>
		);
	}
}
