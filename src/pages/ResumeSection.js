import React, { Component } from "react";
import moment from "moment";

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
						{resumeData.works &&
							resumeData.works.map((work) => {
								return (
									<div className="row item">
										<div className="twelve columns">
											<h3>{work.company}</h3>
											<p className="info">
												{work.title}
												<em className="date">
													&bull;{" "}
													{moment()
														.month(work.monthOfJoining - 1)
														.year(work.yearOfJoining)
														.format("MMM YYYY")}{" "}
													&ndash;{" "}
													{moment()
														.month(work.monthOfLeaving - 1)
														.year(work.yearOfLeaving)
														.format("MMM YYYY")}
												</em>
											</p>

											<ul style={{ listStyleType: "disc", paddingLeft: "15px" }}>
												{work.bullet_points.map((bullet_point) => (
													<li dangerouslySetInnerHTML={{ __html: bullet_point }}></li>
												))}
											</ul>
										</div>
									</div>
								);
							})}
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
						{resumeData.projects &&
							resumeData.projects.map((project) => {
								return (
									<div className="row item">
										<div className="twelve columns">
											<h3>{project.name}</h3>
											<p className="info">
												{project.firstLine && project.firstLine}
												<em className="date">
													&bull;{" "}
													{moment()
														.month(project.startMonth - 1)
														.year(project.startYear)
														.format("MMM YYYY")}{" "}
													&ndash; {moment().month(project.endMonth).year(project.endYear).format("MMM YYYY")}
												</em>
											</p>

											<ul style={{ listStyleType: "disc", paddingLeft: "15px" }}>
												{project.bullet_points.map((bullet_point) => (
													<li>{bullet_point}</li>
												))}
											</ul>
										</div>
									</div>
								);
							})}
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
