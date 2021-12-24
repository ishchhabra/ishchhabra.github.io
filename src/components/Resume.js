import React, { Component } from "react";
export default class Resume extends Component {
	render() {
		let resumeData = this.props.resumeData;
		return (
			<section id="resume">
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
											<h3>{university.universityName}</h3>
											<p className="info">
												{university.major}
												<em className="date">
													&bull; {university.graduationMonth} {university.graduationYear}
												</em>
											</p>
											<p dangerouslySetInnerHTML={{ __html: university.description }} />
										</div>
									</div>
								);
							})}
					</div>
				</div>

				<div className="row work">
					<div className="three columns header-col">
						<h1>
							<span>Work Experience</span>
						</h1>
					</div>
					<div className="nine columns main-col">
						{resumeData.work &&
							resumeData.work.map((work_experience) => {
								return (
									<div className="row item">
										<div className="twelve columns">
											<h3>{work_experience.companyName}</h3>
											<p className="info">
												{work_experience.title}
												<em className="date">
													&bull; {work_experience.monthOfJoining} {work_experience.yearOfJoining} &ndash; {work_experience.monthOfLeaving} {work_experience.yearOfLeaving}
												</em>
											</p>
											<p dangerouslySetInnerHTML={{ __html: work_experience.description }} />
										</div>
									</div>
								);
							})}
					</div>
				</div>

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
											<h3>{project.projectName}</h3>
											<p className="info">
												{project.firstLine && project.firstLine}
												<em className="date">
													&bull; {project.startMonth} {project.startYear} &ndash; {project.endMonth} {project.endYear}
												</em>
											</p>
											<p dangerouslySetInnerHTML={{ __html: project.description }} />
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

				{/* <div className="row skill">
          <div className="three columns header-col">
            <h1>
              <span>Skills</span>
            </h1>
          </div>

          <div className="nine columns main-col">
            <p>{resumeData.skillsDescription}</p>

            <div className="bars">
              <ul className="skills">
                {resumeData.skills &&
                  resumeData.skills.map((item) => {
                    return (
                      <li>
                        <span
                          className={`bar-expand ${item.skillname.toLowerCase()}`}
                        ></span>
                        <em>{item.skillname}</em>
                      </li>
                    );
                  })}
              </ul>
            </div>
          </div>
        </div> */}
			</section>
		);
	}
}
