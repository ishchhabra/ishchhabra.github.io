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
              resumeData.education.map((item) => {
                return (
                  <div className="row item">
                    <div className="twelve columns">
                      <h3>{item.UniversityName}</h3>
                      <p className="info">
                        {item.specialization}
                        <em className="date">
                          &bull; {item.MonthOfPassing} {item.YearOfPassing}
                        </em>
                      </p>
                      <p dangerouslySetInnerHTML={{ __html: item.Description }} />
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
              resumeData.work.map((item) => {
                return (
                  <div className="row item">
                    <div className="twelve columns">
                      <h3>{item.CompanyName}</h3>
                      <p className="info">
                        {item.specialization}
                        <em className="date">
                          &bull; {item.MonthOfJoining} {item.YearOfJoining} &ndash; {item.MonthOfLeaving} {item.YearOfLeaving}
                        </em>
                      </p>
                      <p dangerouslySetInnerHTML={{ __html: item.Achievements }} />
                    </div>
                  </div>
                );
              })}
          </div>

          <div className="nine columns">
            <br />
            <b>
              <font color="red">
                To download the resume as PDF{" "}
                <a href="./IshChhabraResume.pdf" download>
                  click here.
                </a>
              </font>
            </b>
          </div>
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
