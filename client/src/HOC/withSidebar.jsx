import Sidebar from "../components/layouts/Sidebar";

export default function withSidebar(Component) {
    const HOC = (props) => {
        return (
            <div className="row">
                <div className="contentWrap row col-12 col-sm-12 col-md-12 col-lg-9 col-xl-9">
                    <Component {...props} />
                </div>

                <Sidebar />
            </div>
        );
    }

    return HOC;
}