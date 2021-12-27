import React, { Component } from "react";
import moment from "moment";
import GordianSoftware from "../works/GordianSoftware";
import ReachOut from "../works/ReachOut";
import HungryStabbersGaming from "../works/HungryStabbersGaming";
import EthiSim from "../projects/EthiSim";

export default class Resume extends Component {
	render() {
		let resumeData = this.props.resumeData;
		return (
			<section id="resume">
				{/* Education */}
				<div className="row education">
					<div className="three columns header-col">
						<h1>
							<span>Education</span>
						</h1>
					</div>

					<div className="nine columns main-col">
						{resumeData.education &&
							resumeData.education.map((university) => {
								return (
									<div className="row item">
										<div className="twelve columns">
											<h3>{university.name}</h3>
											<p className="info">
												{university.major}
												<em className="date">
													&bull;{" "}
													{moment()
														.month(university.graduationMonth - 1)
														.year(university.graduationYear)
														.format("MMM YYYY")}
												</em>
											</p>
											Achievements:
											<br />
											<ul style={{ listStyleType: "disc", paddingLeft: "15px" }}>
												{university.achievements.map((achievement) => (
													<li>{achievement}</li>
												))}
											</ul>
										</div>
									</div>
								);
							})}
					</div>
				</div>

				{/* Work Experience */}
				<div className="row work">
					<div className="three columns header-col">
						<h1>
							<span>Work Experience</span>
						</h1>
					</div>
					<div className="nine columns main-col">
						<GordianSoftware />
						<ReachOut />
						<HungryStabbersGaming />
					</div>
				</div>

				{/* Projects */}
				<div className="row projects">
					<div className="three columns header-col">
						<h1>
							<span>Projects</span>
						</h1>
					</div>
					<div className="nine columns main-col">
						<EthiSim />
					</div>
				</div>

				<div className="row">
					<b>
						<font color="red">
							To download the resume as PDF{" "}
							<a href="./IshChhabraResume.pdf" download>
								click here.
							</a>
						</font>
					</b>
				</div>
			</section>
		);
	}
}
