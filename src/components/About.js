import React, { Component } from "react";
export default class About extends Component {
	render() {
		let resumeData = this.props.resumeData;
		return (
			<section id="about">
				<div className="row">
					<div className="three columns">
						<img className="profile-pic" src="images/profilepic.jpg" alt="" />
					</div>

					<div className="nine columns main-col">
						<h2>About Me</h2>
						<p>{resumeData.aboutme}</p>

						<div className="row">
							<div className="columns contact-details">
								<h2>Contact Details</h2>
								<p className="address">
									<span>{resumeData.name}</span>
									<br></br>
									<span>{resumeData.address}</span>
									<br></br>
								</p>
							</div>
						</div>
					</div>

					{/* <p className="scrolldown">
            <a className="smoothscroll" href="#resume">
              <i className="icon-down-circle"></i>
            </a>
          </p> */}
				</div>
			</section>
		);
	}
}
