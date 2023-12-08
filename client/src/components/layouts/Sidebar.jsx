import UserMenu from "./Sidebar/UserMenu";
import LastComments from "./Sidebar/LastComments";

const Sidebar = () => {
    return (
        <div className="sidebar row d-none d-sm-none d-md-none d-lg-block col-lg-3 col-xl-3">
            <UserMenu />
            <LastComments />
        </div>
    );
}

export default Sidebar;