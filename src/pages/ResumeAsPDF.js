import { Document, Font, Link, Page, PDFViewer, StyleSheet, Text, View } from "@react-pdf/renderer";
import React, { Component } from "react";
import jsPDF from "jspdf";
import { renderToString } from "react-dom/server";

export default class ResumeAsPDF extends Component {
	render() {
		Font.register({
			family: "Arial",
			fonts: [
				{ src: "https://raw.githubusercontent.com/matomo-org/travis-scripts/master/fonts/Arial.ttf" },
				{ src: "https://raw.githubusercontent.com/matomo-org/travis-scripts/master/fonts/Arial_Bold.ttf", fontWeight: "bold" },
			],
		});
		const styles = StyleSheet.create({
			page: { backgroundColor: "white" },
			view: { margin: 36 },
			section: { margin: 30 },
			full_name: { textAlign: "center", fontFamily: "Arial", fontWeight: "bold", fontSize: 20 },
			contacts: { textAlign: "center", fontSize: 10 },
		});
		const doc = (
			<Document>
				<Page size="LETTER" style={styles.page}>
					<View style={styles.section}>
						<Text style={styles.full_name}>Ish Chhabra</Text>
						<Text style={styles.contacts}>
							Amherst, MA | linkedin.com/in/ishchhabra | <Link src="mailto:ishchhabra12@gmail.com">ishchhabra12@gmail.com</Link> | <Link src="https://ishchhabra.github.io">ishchhabra.github.io</Link>
						</Text>
						<View style={{ flex: 1, flexDirection: "row" }}>
							<View style={{ flex: 1 }}>
								<Text>4 Views 0 Comments</Text>
							</View>
							<View style={{ flex: 1 }}>
								<Text style={{ textAlign: "right" }}>Solve This</Text>
							</View>
						</View>
					</View>
				</Page>
			</Document>
		);
		return (
			<PDFViewer width="1000" height="1000">
				{doc}
			</PDFViewer>
			// <PDFDownloadLink document={doc} fileName="somename.pdf">
			// 	{({ blob, url, loading, error }) => (loading ? "Loading document..." : "Download now!")}
			// </PDFDownloadLink>
		);
	}
}
