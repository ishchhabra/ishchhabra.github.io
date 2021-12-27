import React, { Component } from "react";

export default class HungryStabbersGaming extends Component {
	render() {
		return (
			<div className="row item">
				<div className="twelve columns">
					<h3>
						Co-Founder, CTO
						<em className="date">&bull; Aug 2017 &ndash; Mar 2019</em>
					</h3>
					<p className="info">
						Hungry Stabbers Gaming
						<font color="red" className="date">
							<b> &bull; Dissolved</b>
						</font>
					</p>

					<ul style={{ listStyleType: "disc", paddingLeft: "15px" }}>
						<li>Ranked 1 Counter-Strike gaming community from 2017 to 2019.</li>
						<li>Design, develop, test, and maintain multiple Counter-Strike 1.6 servers on AWS.</li>
						<li>Develop the security infrastructure using AWS SDK for the servers with automated scripts to counter nefarious attacks.</li>
						<li>Develop game mods in a C based scripting language called AMXMODX.</li>
						<li>Foster a fun and friendly gaming environment in a community with 2000+ members.</li>
					</ul>
				</div>
			</div>
		);
	}
}
