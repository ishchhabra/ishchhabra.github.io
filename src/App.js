import React, { Component } from "react";
import AboutSection from "./pages/AboutSection";
import ContactFormSection from "./pages/ContactFormSection";
import FooterSection from "./pages/FooterSection";
import LandingSection from "./pages/LandingSection";
import ResumeSection from "./pages/ResumeSection";
import resumeData from "./resumeData";

class App extends Component {
	render() {
		return (
			<div className="App">
				<LandingSection resumeData={resumeData} />
				<AboutSection resumeData={resumeData} />
				<ResumeSection resumeData={resumeData} />
				<ContactFormSection />
				<FooterSection resumeData={resumeData} />
			</div>
		);
	}
}

export default App;
