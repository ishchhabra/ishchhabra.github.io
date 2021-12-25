import React, { Component } from "react";
import resumeData from "./resumeData";
import ResumeAsPDF from "./pages/ResumeAsPDF";
import LandingSection from "./pages/LandingSection";
import AboutSection from "./pages/AboutSection";
import ResumeSection from "./pages/ResumeSection";
import ContactFormSection from "./pages/ContactFormSection";
import FooterSection from "./pages/FooterSection";

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
